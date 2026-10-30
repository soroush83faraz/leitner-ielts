import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Tag } from '@/components/Chips';
import { Banner, ProgressBar } from '@/components/Feedback';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { createManyVocabulary, findExistingNormalized } from '@/database/repositories/vocabularyRepo';
import {
  BULK_AI_BATCH_SIZE,
  BULK_MAX_CHARS,
  chunk,
  classifyRows,
  isSelectableByDefault,
  parseBulkText,
  summarize,
  type BulkRow,
} from '@/features/vocabulary/bulkImport';
import type { VocabularyInput } from '@/features/vocabulary/model';
import { aiService, describeAiError, isAiConfigured } from '@/services/ai';
import { useApp } from '@/state/AppProvider';
import { ensureAiConsent } from '@/state/aiConsent';
import { useDiscardGuard } from '@/state/useDiscardGuard';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { normalizeTerm, toPersianDigits } from '@/utils/text';

import type { CardSuggestion } from '../../../supabase/functions/_shared/contracts';

type Enrichment = { card?: CardSuggestion; error?: string };
type Done = { created: number; incomplete: number; duplicatesSkipped: number; invalid: number };

const STATUS_TAG: Record<BulkRow['status'], { label: string; kind: 'good' | 'warn' | 'neutral' | 'info' }> = {
  new: { label: 'جدید', kind: 'good' },
  needs_details: { label: 'نیاز به جزئیات', kind: 'warn' },
  duplicate_existing: { label: 'تکراری (در کتابخانه)', kind: 'neutral' },
  duplicate_batch: { label: 'تکراری (در فهرست)', kind: 'neutral' },
  invalid: { label: 'نامعتبر', kind: 'warn' },
};

export default function BulkAdd() {
  const { db, now, bump, prefs, updatePrefs } = useApp();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [enrich, setEnrich] = useState<Record<string, Enrichment>>({});
  const [ai, setAi] = useState<{ running: boolean; done: number; total: number; message: string | null }>({ running: false, done: 0, total: 0, message: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<Done | null>(null);
  const [checking, setChecking] = useState(false);

  const { allowLeave } = useDiscardGuard((!!text.trim() || !!rows) && !result && !saving);
  const summary = useMemo(() => (rows ? summarize(rows) : null), [rows]);

  const analyse = async () => {
    setChecking(true);
    try {
      const parsed = parseBulkText(text);
      const existing = await findExistingNormalized(db, parsed.lines.map((l) => normalizeTerm(l.term)));
      const classified = classifyRows(parsed.lines, existing);
      setRows(classified);
      setTruncated(parsed.truncated);
      setSelected(new Set(classified.filter(isSelectableByDefault).map((r) => r.line)));
      setEnrich({});
    } finally {
      setChecking(false);
    }
  };

  const toggle = (r: BulkRow) => {
    if (r.status === 'invalid' || r.status === 'duplicate_existing') return; // cannot be created from here
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(r.line)) n.delete(r.line);
      else n.add(r.line);
      return n;
    });
  };

  const selectedRows = (rows ?? []).filter((r) => selected.has(r.line));
  const toEnrich = selectedRows.filter((r) => !enrich[r.normalized]?.card);

  const runEnrichment = async () => {
    if (!(await ensureAiConsent(prefs, updatePrefs, 'واژه‌های انتخاب‌شده'))) return;
    const batches = chunk(toEnrich, BULK_AI_BATCH_SIZE);
    setAi({ running: true, done: 0, total: toEnrich.length, message: null });
    let done = 0;
    let stopMessage: string | null = null;
    for (const batch of batches) {
      try {
        const results = await aiService.generateCards({ items: batch.map((r) => ({ term: r.term, meaningFa: r.meaningFa ?? undefined })) });
        setEnrich((prev) => {
          const next = { ...prev };
          for (const [i, res] of results.entries()) {
            const row = batch[i];
            if (!row) continue;
            next[row.normalized] = res.ok ? { card: res.card } : { error: res.error };
          }
          return next;
        });
      } catch (e) {
        // A whole-request failure (offline, rate limit…) stops further batches but keeps everything done so far.
        stopMessage = describeAiError(e).message;
        break;
      }
      done += batch.length;
      setAi({ running: true, done, total: toEnrich.length, message: null });
    }
    setAi({ running: false, done, total: toEnrich.length, message: stopMessage });
  };

  const create = async () => {
    if (!rows || saving || selectedRows.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Re-check just before writing: the library may have changed since the preview.
      const fresh = await findExistingNormalized(db, selectedRows.map((r) => r.normalized));
      const creatable = selectedRows.filter((r) => !fresh.has(r.normalized));
      const inputs: VocabularyInput[] = creatable.map((r) => {
        const c = enrich[r.normalized]?.card;
        return {
          term: r.term,
          meaningFa: r.meaningFa ?? c?.meaningFa ?? null,
          definitionEn: c?.definitionEn ?? null,
          partOfSpeech: c?.partOfSpeech ?? null,
          ipa: c?.ipa ?? null,
          examples: c?.examples ?? [],
          collocations: c?.collocations ?? [],
          wordFamily: c?.wordFamily ?? [],
          topic: c?.topic ?? null,
          entryType: c?.entryType ?? 'word',
          sourceType: 'bulk',
        };
      });
      await createManyVocabulary(db, inputs, now());
      bump();
      setResult({
        created: inputs.length,
        incomplete: inputs.filter((i) => !i.meaningFa).length,
        duplicatesSkipped: selectedRows.length - creatable.length + (summary?.duplicates ?? 0),
        invalid: summary?.invalid ?? 0,
      });
      allowLeave();
    } catch {
      setSaveError('ذخیره انجام نشد و هیچ کارتی اضافه نشد. فهرست شما حفظ شده؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Screen
        title="نتیجه‌ی افزودن"
        footer={
          <>
            <Button label="مشاهده‌ی واژگان" onPress={() => router.replace('/vocabulary')} />
            <Button label="افزودن فهرست دیگر" variant="secondary" onPress={() => { setResult(null); setRows(null); setText(''); }} />
          </>
        }
      >
        <Card>
          <Text variant="heading" accessibilityRole="header">
            {toPersianDigits(result.created)} کارت اضافه شد
          </Text>
          <Text>همه در جعبه‌ی ۱ هستند و برای مرور آماده‌اند.</Text>
          {result.incomplete > 0 ? <Text tone="muted">{toPersianDigits(result.incomplete)} کارت بدون معنی فارسی است و با برچسب «ناقص» نشان داده می‌شود.</Text> : null}
          {result.duplicatesSkipped > 0 ? <Text tone="muted">{toPersianDigits(result.duplicatesSkipped)} مورد تکراری اضافه نشد.</Text> : null}
          {result.invalid > 0 ? <Text tone="muted">{toPersianDigits(result.invalid)} خط نامعتبر نادیده گرفته شد.</Text> : null}
        </Card>
      </Screen>
    );
  }

  if (!rows) {
    return (
      <Screen title="فهرست چندتایی" back footer={<Button label="بررسی و پیش‌نمایش" icon="search" loading={checking} disabled={!text.trim()} onPress={analyse} />}>
        <Text tone="muted">هر خط یک واژه یا عبارت. برای فهرست آماده، معنی را با یک نویسه‌ی تب (Tab) بعد از واژه بگذارید. جداکننده‌های دیگر (ویرگول، خط تیره) جزو خود عبارت حساب می‌شوند.</Text>
        <Field
          label="فهرست واژه‌ها"
          ltr
          lines={10}
          value={text}
          onChangeText={setText}
          placeholder={'mitigate\ncarry out\tانجام دادن\nresilient'}
          counter={{ value: text.length, max: BULK_MAX_CHARS }}
          maxLength={BULK_MAX_CHARS + 1000}
        />
        <Button
          label="چسباندن از کلیپ‌بورد"
          icon="clipboard"
          variant="secondary"
          onPress={async () => {
            const t = await Clipboard.getStringAsync();
            if (t) setText((cur) => (cur ? `${cur}\n${t}` : t));
          }}
        />
      </Screen>
    );
  }

  const nSel = selectedRows.length;
  return (
    <Screen
      title="پیش‌نمایش فهرست"
      back={() => setRows(null)}
      footer={
        <>
          {saveError ? <Banner kind="danger" text={saveError} /> : null}
          <Button label={nSel ? `افزودن ${toPersianDigits(nSel)} کارت` : 'کارتی انتخاب نشده'} icon="check" loading={saving} disabled={nSel === 0 || ai.running} onPress={create} />
        </>
      }
    >
      {summary ? (
        <Text tone="muted">
          {toPersianDigits(summary.total)} خط: {toPersianDigits(summary.new)} جدید · {toPersianDigits(summary.needsDetails)} نیاز به جزئیات · {toPersianDigits(summary.duplicates)} تکراری · {toPersianDigits(summary.invalid)} نامعتبر
        </Text>
      ) : null}
      {truncated ? <Banner kind="warn" text="فهرست از حد مجاز (۵۰۰ خط) بلندتر بود و ادامه‌ی آن نادیده گرفته شد." /> : null}

      <View style={styles.gap}>
        <Button
          label={ai.running ? `در حال تکمیل… ${toPersianDigits(ai.done)} از ${toPersianDigits(ai.total)}` : `تکمیل جزئیات با هوش مصنوعی (${toPersianDigits(toEnrich.length)})`}
          icon="cpu"
          variant="secondary"
          loading={ai.running}
          disabled={!isAiConfigured || toEnrich.length === 0}
          onPress={runEnrichment}
        />
        {ai.running ? <ProgressBar value={ai.done} max={ai.total} label="پیشرفت تکمیل جزئیات" /> : null}
        {!isAiConfigured ? <Text variant="caption" tone="muted">هوش مصنوعی تنظیم نشده؛ کارت‌ها همین‌طور که هستند ساخته می‌شوند.</Text> : null}
        {ai.message ? <Banner kind="danger" text={`${ai.message} نتایج قبلی حفظ شد.`} actionLabel="ادامه‌ی تکمیل" onAction={runEnrichment} /> : null}
      </View>

      <View>
        {rows.map((r) => {
          const on = selected.has(r.line);
          const e = enrich[r.normalized];
          const locked = r.status === 'invalid' || r.status === 'duplicate_existing';
          const tag = STATUS_TAG[r.status];
          return (
            <Pressable
              key={r.line}
              onPress={() => toggle(r)}
              disabled={locked}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: locked }}
              accessibilityLabel={`${r.term || 'خط خالی'}، ${tag.label}`}
              style={[styles.row, { borderColor: colors.border, opacity: locked ? 0.7 : 1 }]}
            >
              <View style={[styles.box, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
                {on ? <Icon name="check" size="sm" tone="onPrimary" /> : null}
              </View>
              <View style={styles.flex}>
                <EnText variant="bodyStrong" serif size={19}>
                  {r.term || '—'}
                </EnText>
                <Text variant="caption" tone="muted">
                  {r.meaningFa ?? e?.card?.meaningFa ?? (r.status === 'invalid' ? r.reason : 'بدون معنی')}
                </Text>
                {r.reason && r.status !== 'invalid' ? <Text variant="caption" tone="muted">{r.reason}</Text> : null}
                <View style={styles.tags}>
                  <Tag label={tag.label} kind={tag.kind} />
                  {e?.card ? <Tag label="جزئیات آماده" kind="good" /> : null}
                  {e?.error ? <Tag label="تکمیل نشد" kind="warn" /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  gap: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: MIN_TOUCH + 24 },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginTop: 2 },
});
