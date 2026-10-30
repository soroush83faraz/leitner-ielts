import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Tag } from '@/components/Chips';
import { Banner, ProgressBar } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { toPersianDigits } from '@/utils/text';

import type { Evaluation } from '../../../supabase/functions/_shared/contracts';

export interface McqItem {
  id: string;
  passage?: string;
  sentence?: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  /** Options are English (passage tasks) or Persian (meaning tasks). */
  optionsLang: 'fa' | 'en';
}

export interface McqAnswer {
  id: string;
  chosen: number;
  correct: boolean;
}

/** One multiple-choice question at a time: choose, check, read the explanation, continue. */
export function McqRunner({ items, onComplete, exit }: { items: McqItem[]; onComplete: (answers: McqAnswer[]) => void; exit: () => void }) {
  const { colors } = useTheme();
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<McqAnswer[]>([]);
  const q = items[i];
  const last = i === items.length - 1;

  const next = () => {
    const all = [...answers, { id: q.id, chosen: chosen!, correct: chosen === q.answerIndex }];
    if (last) return onComplete(all);
    setAnswers(all);
    setI(i + 1);
    setChosen(null);
    setChecked(false);
  };

  return (
    <Screen
      title="خواندن"
      back={exit}
      right={<Text tone="muted">{toPersianDigits(i + 1)} از {toPersianDigits(items.length)}</Text>}
      footer={
        checked ? (
          <Button label={last ? 'پایان' : 'سؤال بعد'} onPress={next} />
        ) : (
          <Button label="بررسی پاسخ" icon="check" disabled={chosen === null} onPress={() => setChecked(true)} />
        )
      }
    >
      <ProgressBar value={i} max={items.length} label={`سؤال ${i + 1} از ${items.length}`} />
      <Reveal key={q.id}>
        <View style={styles.gap}>
          {q.passage ? (
            <Card>
              <EnText serif>{q.passage}</EnText>
            </Card>
          ) : null}
          {q.sentence ? (
            <Card>
              <EnText serif italic size={20}>
                {q.sentence}
              </EnText>
            </Card>
          ) : null}
          <Text variant="heading" accessibilityRole="header">
            {q.question}
          </Text>
          {q.options.map((o, idx) => {
            const isChosen = chosen === idx;
            const showCorrect = checked && idx === q.answerIndex;
            const showWrong = checked && isChosen && idx !== q.answerIndex;
            const border = showCorrect ? colors.success : showWrong ? colors.danger : isChosen ? colors.primary : colors.border;
            return (
              <Pressable
                key={idx}
                disabled={checked}
                onPress={() => setChosen(idx)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isChosen, disabled: checked }}
                accessibilityLabel={`${o}${showCorrect ? '، پاسخ درست' : showWrong ? '، پاسخ نادرست' : ''}`}
                style={[styles.option, { borderColor: border, borderWidth: isChosen || checked ? 2 : 1.5, backgroundColor: showCorrect ? colors.successSoft : showWrong ? colors.dangerSoft : colors.surface }]}
              >
                {q.optionsLang === 'en' ? <EnText style={styles.flex}>{o}</EnText> : <Text style={styles.flex}>{o}</Text>}
                {showCorrect ? <Icon name="check-circle" tone="success" /> : showWrong ? <Icon name="x-circle" tone="danger" /> : null}
              </Pressable>
            );
          })}
          {checked ? (
            <Reveal>
              <Banner kind={chosen === q.answerIndex ? 'success' : 'danger'} text={`${chosen === q.answerIndex ? 'درست بود.' : 'درست نبود.'} ${q.explanation}`} />
            </Reveal>
          ) : null}
        </View>
      </Reveal>
    </Screen>
  );
}

export function ResultScreen({
  title,
  correct,
  total,
  note,
  onAgain,
  onDone,
}: {
  title: string;
  correct: number;
  total: number;
  note?: string;
  onAgain: () => void;
  onDone: () => void;
}) {
  return (
    <Screen
      title={title}
      footer={
        <>
          <Button label="تمرین دیگر" variant="secondary" onPress={onAgain} />
          <Button label="بازگشت" onPress={onDone} />
        </>
      }
    >
      <Card>
        <Text variant="heading" accessibilityRole="header">
          {toPersianDigits(correct)} پاسخ درست از {toPersianDigits(total)}
        </Text>
        <Text tone="muted">این تمرین ذخیره شد. این نتیجه فقط به همین تمرین مربوط است و جعبه‌های لایتنر را تغییر نمی‌دهد.</Text>
        {note ? <Text tone="muted">{note}</Text> : null}
      </Card>
    </Screen>
  );
}

const ISSUE_FA: Record<string, string> = { grammar: 'دستور', collocation: 'هم‌نشینی', meaning: 'معنی', naturalness: 'طبیعی بودن', spelling: 'املا', vocabulary: 'واژگان' };
const CORRECTNESS_FA = { correct: 'درست', incorrect: 'نادرست', uncertain: 'نامطمئن' } as const;

export function FeedbackView({ result }: { result: Evaluation }) {
  const { colors } = useTheme();
  return (
    <View style={styles.gap}>
      <Text variant="heading" accessibilityRole="header">
        بازخورد
      </Text>
      <Card>
        <Text variant="label" tone="muted">
          متن اصلاح‌شده
        </Text>
        <EnText serif>{result.correctedText}</EnText>
      </Card>

      {result.issues.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="label">نکته‌ها</Text>
          {result.issues.map((x, i) => (
            <View key={i} style={[styles.issue, { borderColor: colors.border }]}>
              <Tag label={ISSUE_FA[x.type] ?? x.type} kind="info" />
              {x.original ? <EnText style={{ textDecorationLine: 'line-through' }} tone="muted">{x.original}</EnText> : null}
              <EnText tone="primary">{x.suggestion}</EnText>
              <Text variant="caption">{x.explanationFa}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Banner kind="success" text="مورد قابل اصلاحی گزارش نشد." />
      )}

      {result.vocabularyUse.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="label">کاربرد واژه‌های هدف</Text>
          {result.vocabularyUse.map((u, i) => (
            <View key={i} style={[styles.use, { borderColor: colors.border }]}>
              <Icon name={!u.used ? 'minus-circle' : u.correctness === 'correct' ? 'check-circle' : u.correctness === 'incorrect' ? 'x-circle' : 'help-circle'} tone={u.correctness === 'correct' ? 'success' : u.correctness === 'incorrect' ? 'danger' : 'muted'} />
              <View style={styles.flex}>
                <EnText variant="bodyStrong">{u.term}</EnText>
                <Text variant="caption" tone="muted">
                  {u.used ? (u.correctness ? CORRECTNESS_FA[u.correctness] : 'استفاده شد') : 'استفاده نشد'} — {u.reasonFa}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Banner kind="info" text={`گام بعدی: ${result.followUpFa}`} />
      <Text variant="caption" tone="muted">
        این بازخورد آموزشی و تقریبی است؛ نمره‌ی رسمی آیلتس یا پیش‌بینی باند نیست.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, minHeight: MIN_TOUCH + 8 },
  issue: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  use: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
