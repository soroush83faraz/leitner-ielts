import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chips';
import { Field } from '@/components/Field';
import { Banner } from '@/components/Feedback';
import { Text } from '@/components/Text';
import { aiService, describeAiError, isAiConfigured } from '@/services/ai';
import { useApp } from '@/state/AppProvider';
import { ensureAiConsent } from '@/state/aiConsent';
import { space } from '@/theme/tokens';

import { applySuggestion, type CardFormState, type FormErrors } from './formModel';
import { COMMON_PARTS_OF_SPEECH, ENTRY_TYPES, ENTRY_TYPE_FA, TOPICS, TOPIC_FA } from './model';

export function CardForm({
  value,
  onChange,
  errors,
  termLocked,
}: {
  value: CardFormState;
  onChange: (next: CardFormState) => void;
  errors?: FormErrors;
  termLocked?: boolean;
}) {
  const { prefs, updatePrefs } = useApp();
  const [more, setMore] = useState(!!(value.definitionEn || value.examples.length || value.collocationsText || value.ipa));
  const [ai, setAi] = useState<{ busy: boolean; error: string | null; note: string | null }>({ busy: false, error: null, note: null });
  const set = <K extends keyof CardFormState>(k: K, v: CardFormState[K]) => onChange({ ...value, [k]: v });

  const suggest = async () => {
    if (!value.term.trim()) return setAi({ busy: false, error: 'اول واژه را وارد کنید.', note: null });
    if (!(await ensureAiConsent(prefs, updatePrefs, 'واژه و جمله‌ی زمینه'))) return;
    setAi({ busy: true, error: null, note: null });
    try {
      const s = await aiService.generateCard({ term: value.term.trim(), context: (value.sourceSentence || undefined)?.slice(0, 500) });
      const { form, filled } = applySuggestion(value, s);
      onChange(form);
      setMore(true);
      setAi({ busy: false, error: null, note: filled > 0 ? 'پیشنهادها در فیلدهای خالی گذاشته شد. قبل از ذخیره بررسی و ویرایش کنید.' : 'همه‌ی فیلدها از قبل پر بودند؛ چیزی تغییر نکرد.' });
    } catch (e) {
      // Everything the user typed stays exactly as it was.
      setAi({ busy: false, error: describeAiError(e).message, note: null });
    }
  };

  return (
    <View style={styles.gap}>
      <Field
        label="واژه یا عبارت انگلیسی"
        ltr
        value={value.term}
        onChangeText={(t) => set('term', t)}
        error={errors?.term}
        editable={!termLocked}
        maxLength={80}
        returnKeyType="next"
        testID="field-term"
      />

      <Field label="معنی فارسی" value={value.meaningFa} onChangeText={(t) => set('meaningFa', t)} hint="اگر خالی بماند، کارت با برچسب «ناقص» ذخیره می‌شود." maxLength={300} />

      <Field
        label="جمله‌ی زمینه (اختیاری)"
        ltr
        lines={2}
        value={value.sourceSentence}
        onChangeText={(t) => set('sourceSentence', t)}
        hint="جمله‌ای که واژه را در آن دیدید؛ یادگیری در بافت ماندگارتر است."
        maxLength={500}
      />

      <View style={styles.gap}>
        <Button
          label={ai.busy ? 'در حال ساخت پیشنهاد…' : 'پیشنهاد کارت با هوش مصنوعی'}
          icon="cpu"
          variant="secondary"
          loading={ai.busy}
          disabled={!isAiConfigured}
          onPress={suggest}
          hint="فیلدهای خالی را پر می‌کند و چیزی را بدون تأیید شما ذخیره نمی‌کند"
        />
        {!isAiConfigured ? (
          <Text variant="caption" tone="muted">
            سرویس هوش مصنوعی روی این نسخه تنظیم نشده است؛ کارت را دستی کامل کنید.
          </Text>
        ) : null}
        {ai.error ? <Banner kind="danger" text={ai.error} actionLabel="تلاش دوباره" onAction={suggest} /> : null}
        {ai.note ? <Banner kind="success" text={ai.note} /> : null}
      </View>

      <Button label={more ? 'جزئیات کمتر' : 'جزئیات بیشتر (تلفظ، مثال، هم‌نشین…)'} variant="quiet" block={false} icon={more ? 'chevron-up' : 'chevron-down'} onPress={() => setMore((m) => !m)} />

      {more ? (
        <View style={styles.gap}>
          <Field label="تعریف انگلیسی" ltr lines={2} value={value.definitionEn} onChangeText={(t) => set('definitionEn', t)} maxLength={400} />
          <Field label="تلفظ (IPA)" ltr value={value.ipa} onChangeText={(t) => set('ipa', t)} maxLength={80} />

          <View style={styles.gap}>
            <Text variant="label">نوع کلمه</Text>
            <ChipRow>
              {COMMON_PARTS_OF_SPEECH.map((p) => (
                <Chip key={p} label={p} selected={value.partOfSpeech === p} onPress={() => set('partOfSpeech', value.partOfSpeech === p ? '' : p)} />
              ))}
            </ChipRow>
          </View>

          <View style={styles.gap}>
            <Text variant="label">نوع ورودی</Text>
            <ChipRow>
              {ENTRY_TYPES.map((t) => (
                <Chip key={t} label={ENTRY_TYPE_FA[t]} selected={value.entryType === t} onPress={() => set('entryType', t)} />
              ))}
            </ChipRow>
          </View>

          <View style={styles.gap}>
            <Text variant="label">موضوع</Text>
            <ChipRow>
              {TOPICS.map((t) => (
                <Chip key={t} label={TOPIC_FA[t]} selected={value.topic === t} onPress={() => set('topic', value.topic === t ? null : t)} />
              ))}
            </ChipRow>
          </View>

          <View style={styles.gap}>
            <Text variant="label">جمله‌های نمونه</Text>
            {value.examples.map((ex, i) => (
              <View key={i} style={styles.example}>
                <View style={styles.exampleFields}>
                  <Field
                    label={`جمله‌ی ${i + 1}`}
                    ltr
                    value={ex.sentence}
                    onChangeText={(t) => set('examples', value.examples.map((x, j) => (j === i ? { ...x, sentence: t } : x)))}
                    maxLength={300}
                  />
                  <Field
                    label="ترجمه‌ی فارسی"
                    value={ex.translationFa}
                    onChangeText={(t) => set('examples', value.examples.map((x, j) => (j === i ? { ...x, translationFa: t } : x)))}
                    maxLength={300}
                  />
                </View>
                <IconButton icon="trash-2" label={`حذف جمله‌ی ${i + 1}`} tone="danger" onPress={() => set('examples', value.examples.filter((_, j) => j !== i))} />
              </View>
            ))}
            {value.examples.length < 5 ? (
              <Button label="افزودن جمله" icon="plus" variant="secondary" block={false} onPress={() => set('examples', [...value.examples, { sentence: '', translationFa: '' }])} />
            ) : null}
          </View>

          <Field label="هم‌نشین‌ها (collocations)" ltr lines={3} value={value.collocationsText} onChangeText={(t) => set('collocationsText', t)} hint="هر مورد در یک خط یا با ویرگول جدا شود." />
          <Field label="خانواده‌ی واژه" ltr lines={3} value={value.wordFamilyText} onChangeText={(t) => set('wordFamilyText', t)} hint="مثلاً: ubiquity (noun) — هر مورد در یک خط." />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  example: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  exampleFields: { flex: 1, gap: space.sm },
});
