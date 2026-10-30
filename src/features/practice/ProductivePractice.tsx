import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chips';
import { Banner, StateView } from '@/components/Feedback';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { saveFinishedPractice } from '@/database/repositories/practiceRepo';
import { isIncomplete, type VocabularyWithState } from '@/features/vocabulary/model';
import { aiService, describeAiError, isAiConfigured, isRetryableAiError } from '@/services/ai';
import { useApp } from '@/state/AppProvider';
import { ensureAiConsent } from '@/state/aiConsent';
import { useDiscardGuard } from '@/state/useDiscardGuard';
import { useOnline } from '@/state/device';
import { space } from '@/theme/tokens';
import { newId, toPersianDigits } from '@/utils/text';

import type { Evaluation } from '../../../supabase/functions/_shared/contracts';

import { SPEAKING_PROMPTS, WRITING_PROMPTS, dominantTopic, pickPrompt, pickTargets } from './local';
import { FeedbackView } from './PracticeParts';

type Mode = 'writing' | 'speaking';
const MAX_CHARS = 2000;

function draw(cards: VocabularyWithState[], mode: Mode, part: 1 | 2 | 3) {
  const complete = cards.filter((c) => !isIncomplete(c.entry));
  const targets = pickTargets(complete.length >= 2 ? complete : cards, 3);
  const topic = dominantTopic(targets);
  const prompt = mode === 'writing' ? pickPrompt(WRITING_PROMPTS[topic]) : pickPrompt(SPEAKING_PROMPTS[part][topic]);
  return { targets, prompt };
}

/**
 * Writing and text-based speaking preparation. Feedback is requested explicitly; the
 * learner's text is never cleared by a failure, and saving works without feedback.
 */
export function ProductivePractice({ mode, cards, exit }: { mode: Mode; cards: VocabularyWithState[]; exit: () => void }) {
  const { db, now, bump, prefs, updatePrefs } = useApp();
  const online = useOnline();
  const [part, setPart] = useState<1 | 2 | 3>(1);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<Evaluation | null>(null);
  const [ai, setAi] = useState<{ busy: boolean; error: string | null; retry: boolean }>({ busy: false, error: null, retry: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ withFeedback: boolean; error?: string } | null>(null);

  // Words and prompt are chosen once per round (lazy state), never re-randomised by re-renders.
  const [round, setRound] = useState(() => draw(cards, mode, 1));
  const { targets, prompt } = round;
  const reroll = (p: 1 | 2 | 3 = part) => setRound(draw(cards, mode, p));

  const { allowLeave } = useDiscardGuard(!!text.trim() && !saved);

  if (cards.length === 0) {
    return (
      <Screen title={mode === 'writing' ? 'نوشتن' : 'گفتاری (متنی)'} back={exit}>
        <StateView kind="empty" title="ابتدا چند واژه اضافه کنید" message="این تمرین با واژه‌های ذخیره‌شده‌ی شما ساخته می‌شود." />
      </Screen>
    );
  }

  const title = mode === 'writing' ? 'نوشتن' : 'گفتاری (متنی)';
  const evaluate = async () => {
    if (text.trim().length < 3 || ai.busy) return;
    if (!(await ensureAiConsent(prefs, updatePrefs, 'متنی که نوشته‌اید و واژه‌های هدف'))) return;
    setAi({ busy: true, error: null, retry: false });
    try {
      const result = await aiService.evaluateWriting({
        text: text.trim(),
        prompt,
        mode,
        targets: targets.map((t) => ({ term: t.entry.term, meaningFa: t.entry.meaningFa ?? undefined })),
      });
      setFeedback(result);
      setAi({ busy: false, error: null, retry: false });
    } catch (e) {
      const d = describeAiError(e);
      setAi({ busy: false, error: d.message, retry: isRetryableAiError(d.code) });
    }
  };

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await saveFinishedPractice(db, {
        id: newId(),
        skill: mode,
        activityType: mode === 'writing' ? 'free_writing' : `speaking_part_${part}_text`,
        targetVocabularyIds: targets.map((t) => t.entry.id),
        prompt,
        payload: { targets: targets.map((t) => t.entry.term) },
        userResponse: text.trim(),
        feedback: feedback ?? undefined,
        createdAt: now(),
        completedAt: now(),
      });
      bump();
      allowLeave();
      setSaved({ withFeedback: !!feedback });
    } catch {
      setSaved({ withFeedback: !!feedback, error: 'ذخیره انجام نشد. متن شما هنوز اینجاست؛ دوباره تلاش کنید.' });
    } finally {
      setSaving(false);
    }
  };

  if (saved && !saved.error) {
    return (
      <Screen
        title={title}
        footer={
          <>
            <Button
              label="تمرین دیگر"
              variant="secondary"
              onPress={() => {
                setSaved(null);
                setText('');
                setFeedback(null);
                reroll();
              }}
            />
            <Button label="بازگشت" onPress={exit} />
          </>
        }
      >
        <Card>
          <Text variant="heading" accessibilityRole="header">
            تمرین ذخیره شد
          </Text>
          <Text tone="muted">
            {saved.withFeedback ? 'متن و بازخورد در تاریخچه‌ی شما ثبت شد.' : 'متن بدون بازخورد ذخیره شد؛ در آمار «کاربرد فعال» فقط تمرین‌های دارای بازخورد حساب می‌شوند.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title={title}
      back={exit}
      footer={
        <>
          {saved?.error ? <Banner kind="danger" text={saved.error} /> : null}
          <Button
            label={feedback ? 'دریافت دوباره‌ی بازخورد' : 'دریافت بازخورد'}
            icon="cpu"
            variant={feedback ? 'secondary' : 'primary'}
            loading={ai.busy}
            disabled={!isAiConfigured || text.trim().length < 3 || online === false}
            onPress={evaluate}
            hint="فقط وقتی این دکمه را بزنید، متن شما برای ارزیابی ارسال می‌شود"
          />
          <Button label={feedback ? 'ذخیره‌ی تمرین' : 'ذخیره بدون بازخورد'} icon="check" variant={feedback ? 'primary' : 'secondary'} loading={saving} disabled={!text.trim()} onPress={save} />
        </>
      }
    >
      <Banner
        kind="info"
        text={
          mode === 'writing'
            ? 'بازخورد آموزشی درباره‌ی دستور، هم‌نشینی، املا و کاربرد واژه‌ها. نمره‌ی رسمی آیلتس نیست.'
            : 'آمادگی متنی برای بخش Speaking: پاسخ را تایپ می‌کنید. ضبط صدا و ارزیابی تلفظ یا روانی در این نسخه نیست.'
        }
      />

      {mode === 'speaking' ? (
        <ChipRow>
          {([1, 2, 3] as const).map((p) => (
            <Chip key={p} label={`Part ${p}`} selected={part === p} onPress={() => { setPart(p); reroll(p); }} />
          ))}
        </ChipRow>
      ) : null}

      <Card>
        <EnText serif size={20}>
          {prompt}
        </EnText>
        <Button label="پرسش دیگر" icon="refresh-cw" variant="quiet" block={false} onPress={() => reroll()} />
      </Card>

      <View style={styles.gap}>
        <Text variant="label">واژه‌های پیشنهادی (اجباری نیست؛ فقط جایی که طبیعی است)</Text>
        <View style={styles.targets}>
          {targets.map((t) => (
            <View key={t.entry.id} style={styles.target}>
              <EnText variant="bodyStrong" serif>
                {t.entry.term}
              </EnText>
              <Text variant="caption" tone="muted">
                {t.entry.meaningFa ?? ''}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Field
        label={mode === 'writing' ? 'متن شما' : 'پاسخ شما'}
        ltr
        lines={9}
        value={text}
        onChangeText={(t) => setText(t.slice(0, MAX_CHARS))}
        counter={{ value: text.length, max: MAX_CHARS }}
        editable={!ai.busy}
      />

      {!isAiConfigured ? <Banner kind="warn" text="هوش مصنوعی تنظیم نشده؛ می‌توانید بنویسید و بدون بازخورد ذخیره کنید." /> : null}
      {online === false && isAiConfigured ? <Banner kind="info" text="آفلاین هستید. بنویسید و ذخیره کنید؛ بازخورد نیاز به اینترنت دارد." /> : null}
      {ai.error ? <Banner kind="danger" text={ai.error} actionLabel={ai.retry ? 'تلاش دوباره' : undefined} onAction={evaluate} /> : null}
      {text.trim() && !ai.error && !feedback && isAiConfigured ? (
        <Text variant="caption" tone="muted">
          {toPersianDigits(text.trim().split(/\s+/).length)} واژه نوشته‌اید.
        </Text>
      ) : null}

      {feedback ? <FeedbackView result={feedback} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  target: { gap: 2 },
});
