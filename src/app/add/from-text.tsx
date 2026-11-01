import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Tag } from '@/components/Chips';
import { Banner, StateView } from '@/components/Feedback';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { createManyVocabulary, findExistingNormalized, type DuplicateHit } from '@/database/repositories/vocabularyRepo';
import { TOPIC_FA, type VocabularyInput } from '@/features/vocabulary/model';
import { aiService, describeAiError, useAiConfigured, isRetryableAiError } from '@/services/ai';
import { useApp } from '@/state/AppProvider';
import { ensureAiConsent } from '@/state/aiConsent';
import { useDiscardGuard } from '@/state/useDiscardGuard';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { normalizeTerm, toPersianDigits } from '@/utils/text';

import { LIMITS, type ExtractedCandidate } from '../../../supabase/functions/_shared/contracts';

interface Candidate extends ExtractedCandidate {
  key: string;
  normalized: string;
  existing?: DuplicateHit;
  meaning: string;
}

export default function FromText() {
  const { db, now, bump, prefs, updatePrefs } = useApp();
  const aiOn = useAiConfigured();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const { allowLeave } = useDiscardGuard((!!text.trim() || !!cands) && saved === null && !saving);
  const tooShort = text.trim().length < 20;
  const tooLong = text.length > LIMITS.extractTextMax;

  const extract = async () => {
    if (tooShort || tooLong || busy) return;
    if (!(await ensureAiConsent(prefs, updatePrefs, 'متنی که چسبانده‌اید'))) return;
    setBusy(true);
    setError(null);
    try {
      const out = await aiService.extractVocabulary({ text: text.trim(), maxCandidates: LIMITS.extractCandidatesDefault });
      const existing = await findExistingNormalized(db, out.map((c) => normalizeTerm(c.term)));
      const seen = new Set<string>();
      const list: Candidate[] = [];
      for (const [i, c] of out.entries()) {
        const normalized = normalizeTerm(c.term);
        if (!normalized || seen.has(normalized)) continue; // duplicates within the results
        seen.add(normalized);
        list.push({ ...c, key: `${i}-${normalized}`, normalized, existing: existing.get(normalized), meaning: c.meaningInContext });
      }
      setCands(list);
      setSelected(new Set(list.filter((c) => !c.existing).map((c) => c.key)));
    } catch (e) {
      const d = describeAiError(e);
      setError({ message: d.message, retry: isRetryableAiError(d.code) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!cands || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const chosen = cands.filter((c) => selected.has(c.key));
      const fresh = await findExistingNormalized(db, chosen.map((c) => c.normalized));
      const inputs: VocabularyInput[] = chosen
        .filter((c) => !fresh.has(c.normalized))
        .map((c) => ({
          term: c.term,
          meaningFa: c.meaning.trim() || null,
          // Only a sentence that was verified against the pasted text is ever stored.
          sourceSentence: c.sourceVerified ? c.sourceSentence : null,
          entryType: c.entryType,
          topic: c.topic,
          sourceType: 'text',
        }));
      await createManyVocabulary(db, inputs, now());
      bump();
      allowLeave();
      setSaved(inputs.length);
    } catch {
      setSaveError('ذخیره انجام نشد و چیزی اضافه نشد. انتخاب‌های شما حفظ شده؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  if (!aiOn) {
    return (
      <Screen title="استخراج از متن" back>
        <StateView
          kind="error"
          title="هوش مصنوعی تنظیم نشده است"
          message="استخراج از متن به سرویس هوش مصنوعی نیاز دارد که روی این نسخه فعال نیست. می‌توانید واژه‌ها را دستی یا از فهرست اضافه کنید."
          actionLabel="افزودن از فهرست"
          onAction={() => router.replace('/add/bulk')}
          secondaryLabel="افزودن دستی"
          onSecondary={() => router.replace('/add/manual')}
        />
      </Screen>
    );
  }

  if (saved !== null) {
    return (
      <Screen
        title="ذخیره شد"
        footer={<Button label="مشاهده‌ی واژگان" onPress={() => router.replace('/vocabulary')} />}
      >
        <StateView kind="empty" title={`${toPersianDigits(saved)} کارت اضافه شد`} message="در جعبه‌ی ۱ قرار گرفتند و برای مرور آماده‌اند." />
      </Screen>
    );
  }

  if (!cands) {
    return (
      <Screen
        title="استخراج از متن"
        back
        footer={<Button label="استخراج واژه‌ها" icon="zap" loading={busy} disabled={tooShort || tooLong} onPress={extract} />}
      >
        <Banner kind="info" text="متنی که اینجا می‌چسبانید برای تحلیل به سرور برنامه و یک ارائه‌دهنده‌ی هوش مصنوعی ارسال می‌شود. متن شخصی یا محرمانه نچسبانید." />
        <Field
          label="متن انگلیسی"
          ltr
          lines={10}
          value={text}
          onChangeText={setText}
          counter={{ value: text.length, max: LIMITS.extractTextMax }}
          error={tooLong ? `متن از ${toPersianDigits(LIMITS.extractTextMax)} نویسه بیشتر است.` : null}
          hint={tooShort ? 'حداقل ۲۰ نویسه لازم است.' : `حداکثر ${toPersianDigits(LIMITS.extractCandidatesDefault)} واژه‌ی مفید پیشنهاد می‌شود.`}
        />
        {error ? <Banner kind="danger" text={error.message} actionLabel={error.retry ? 'تلاش دوباره' : undefined} onAction={extract} /> : null}
      </Screen>
    );
  }

  const n = selected.size;
  return (
    <Screen
      title="واژه‌های پیشنهادی"
      back={() => setCands(null)}
      footer={
        <>
          {saveError ? <Banner kind="danger" text={saveError} /> : null}
          <Button label={n ? `افزودن ${toPersianDigits(n)} کارت` : 'واژه‌ای انتخاب نشده'} icon="check" loading={saving} disabled={n === 0} onPress={save} />
        </>
      }
    >
      {cands.length === 0 ? (
        <StateView kind="empty" title="واژه‌ی مناسبی پیدا نشد" message="متن را بلندتر یا آموزنده‌تر کنید و دوباره امتحان کنید." actionLabel="بازگشت به متن" onAction={() => setCands(null)} />
      ) : (
        <Text tone="muted">معنی‌ها را در صورت نیاز ویرایش کنید و فقط مواردی را که می‌خواهید نگه دارید. چیزی تا «افزودن» ذخیره نمی‌شود.</Text>
      )}
      {cands.map((c) => {
        const on = selected.has(c.key);
        return (
          <View key={c.key} style={[styles.item, { borderColor: on ? colors.primary : colors.border, backgroundColor: colors.surface, borderWidth: on ? 2 : 1 }]}>
            <Pressable
              onPress={() =>
                setSelected((s) => {
                  const nx = new Set(s);
                  if (nx.has(c.key)) nx.delete(c.key);
                  else nx.add(c.key);
                  return nx;
                })
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.term}
              style={styles.head}
            >
              <View style={[styles.box, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
                {on ? <Icon name="check" size="sm" tone="onPrimary" /> : null}
              </View>
              <EnText serif variant="bodyStrong" size={21} style={styles.flex}>
                {c.term}
              </EnText>
              {c.existing ? <Tag label="از قبل هست" /> : null}
            </Pressable>
            <View style={styles.tags}>
              {c.difficulty ? <Tag label={c.difficulty} kind="info" /> : null}
              {c.topic ? <Tag label={TOPIC_FA[c.topic]} /> : null}
              <Tag label={c.entryType === 'word' ? 'واژه' : c.entryType === 'phrase' ? 'عبارت' : 'هم‌نشینی'} />
            </View>
            {on ? <Field label="معنی در این متن" value={c.meaning} onChangeText={(t) => setCands((cur) => cur!.map((x) => (x.key === c.key ? { ...x, meaning: t } : x)))} /> : <Text tone="muted">{c.meaning}</Text>}
            {c.sourceVerified && c.sourceSentence ? (
              <EnText serif italic tone="muted">
                {c.sourceSentence}
              </EnText>
            ) : (
              <Text variant="caption" tone="danger">
                جمله‌ی منبع در متن شما پیدا نشد؛ ذخیره نمی‌شود.
              </Text>
            )}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
