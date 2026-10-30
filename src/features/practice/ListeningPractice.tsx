import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, ProgressBar, StateView } from '@/components/Feedback';
import { Field } from '@/components/Field';
import { Reveal } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { saveFinishedPractice } from '@/database/repositories/practiceRepo';
import type { VocabularyWithState } from '@/features/vocabulary/model';
import { useApp } from '@/state/AppProvider';
import { useEnglishSpeech } from '@/state/device';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { newId, toPersianDigits } from '@/utils/text';

import { checkDictation, type DictationResult } from './dictation';
import { buildDictationItems, pickTargets, type DictationItem } from './local';
import { ResultScreen } from './PracticeParts';

const VERDICT_FA = { correct: 'درست نوشتید.', spelling_error: 'تقریباً درست است، ولی املا اشتباه دارد.', different: 'پاسخ با متن اصلی فرق دارد.' } as const;

export function ListeningPractice({ cards, exit }: { cards: VocabularyWithState[]; exit: () => void }) {
  const { db, now, bump } = useApp();
  const { colors } = useTheme();
  const speech = useEnglishSpeech();
  const [round, setRound] = useState(0);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<DictationResult | null>(null);
  const [results, setResults] = useState<{ id: string; verdict: DictationResult['verdict'] }[]>([]);
  const [done, setDone] = useState<{ correct: number; total: number; error?: string } | null>(null);

  // No installed English voice => no audio. Never show a dead play button; fall back to spelling from the Persian meaning.
  const audio = speech.available === true;
  const items = useMemo<DictationItem[]>(() => {
    const picked = pickTargets(cards, 5);
    const built = buildDictationItems(picked);
    return audio ? built : built.map((b) => ({ ...b, kind: 'word' as const, text: b.term })).filter((b) => b.meaningFa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, round, audio]);

  if (speech.available === null) {
    return (
      <Screen title="شنیدن" back={exit}>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (done) {
    return (
      <ResultScreen
        title="شنیدن"
        correct={done.correct}
        total={done.total}
        note={done.error}
        onAgain={() => {
          setDone(null);
          setI(0);
          setTyped('');
          setChecked(null);
          setResults([]);
          setRound((r) => r + 1);
        }}
        onDone={exit}
      />
    );
  }
  if (items.length === 0) {
    return (
      <Screen title="شنیدن" back={exit}>
        <StateView kind="empty" title="کارتی برای این تمرین نیست" message="ابتدا چند واژه اضافه کنید. اگر صدای انگلیسی دستگاه نصب نباشد، کارت‌ها باید معنی فارسی هم داشته باشند." />
      </Screen>
    );
  }

  const item = items[i];
  const last = i === items.length - 1;

  const check = () => {
    if (!typed.trim()) return;
    setChecked(checkDictation(item.text, typed));
  };

  const next = async () => {
    const all = [...results, { id: item.vocabularyId, verdict: checked!.verdict }];
    if (!last) {
      setResults(all);
      setI(i + 1);
      setTyped('');
      setChecked(null);
      return;
    }
    const correct = all.filter((r) => r.verdict === 'correct').length;
    try {
      await saveFinishedPractice(db, {
        id: newId(),
        skill: 'listening',
        activityType: audio ? 'dictation' : 'spelling_recall',
        targetVocabularyIds: all.map((r) => r.id),
        prompt: audio ? 'املای شنیداری' : 'املا از روی معنی',
        payload: { results: all },
        scoreCorrect: correct,
        scoreTotal: all.length,
        createdAt: now(),
        completedAt: now(),
      });
      bump();
      setDone({ correct, total: all.length });
    } catch {
      setDone({ correct, total: all.length, error: 'ذخیره‌ی نتیجه انجام نشد؛ این تمرین در آمار حساب نمی‌شود.' });
    }
  };

  return (
    <Screen
      title="شنیدن"
      back={exit}
      right={<Text tone="muted">{toPersianDigits(i + 1)} از {toPersianDigits(items.length)}</Text>}
      footer={checked ? <Button label={last ? 'پایان' : 'مورد بعد'} onPress={next} /> : <Button label="بررسی" icon="check" disabled={!typed.trim()} onPress={check} />}
    >
      <ProgressBar value={i} max={items.length} label={`مورد ${i + 1} از ${items.length}`} />
      {!audio ? <Banner kind="info" text="صدای انگلیسی روی این دستگاه نصب نیست. به‌جای شنیدن، املای واژه را از روی معنی فارسی می‌نویسید." /> : null}

      <Reveal key={`${round}-${i}`}>
        <View style={styles.gap}>
          <Card>
            {audio ? (
              <>
                <Text variant="heading">{item.kind === 'sentence' ? 'جمله را بشنوید و بنویسید' : 'واژه را بشنوید و بنویسید'}</Text>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Button label={speech.speaking ? 'در حال پخش…' : 'پخش'} icon="volume-2" onPress={() => speech.speak(item.text)} />
                  </View>
                  <View style={styles.flex}>
                    <Button label="آهسته" icon="rotate-ccw" variant="secondary" onPress={() => speech.speak(item.text, true)} />
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text variant="heading">این واژه‌ی انگلیسی را بنویسید</Text>
                <Text variant="title">{item.meaningFa}</Text>
              </>
            )}
          </Card>

          <Field label="آنچه شنیدید" ltr value={typed} onChangeText={setTyped} editable={!checked} autoFocus={false} lines={item.kind === 'sentence' ? 3 : 1} />

          {checked ? (
            <Reveal>
              <Banner kind={checked.verdict === 'correct' ? 'success' : checked.verdict === 'spelling_error' ? 'warn' : 'danger'} text={VERDICT_FA[checked.verdict]} />
              {checked.verdict !== 'correct' ? (
                <View style={[styles.diff, { borderColor: colors.border }]}>
                  <Text variant="label">پاسخ درست</Text>
                  <EnText serif size={20}>
                    {item.text}
                  </EnText>
                  <View style={styles.tokens}>
                    {checked.tokens
                      .filter((t) => t.status !== 'ok')
                      .map((t, k) => (
                        <View key={k} style={styles.tokenRow}>
                          <Text variant="caption" tone={t.status === 'spelling' ? 'accent' : 'danger'}>
                            {t.status === 'spelling' ? 'غلط املایی' : t.status === 'wrong' ? 'واژه‌ی دیگر' : t.status === 'missing' ? 'جا افتاده' : 'اضافه'}
                          </Text>
                          {t.typed ? <EnText variant="caption" style={{ textDecorationLine: t.status === 'extra' ? 'line-through' : 'none' }}>{t.typed}</EnText> : null}
                          {t.expected && t.status !== 'missing' ? <EnText variant="caption" tone="success">{`← ${t.expected}`}</EnText> : null}
                          {t.status === 'missing' ? <EnText variant="caption" tone="success">{t.expected}</EnText> : null}
                        </View>
                      ))}
                  </View>
                </View>
              ) : null}
            </Reveal>
          ) : null}
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  diff: { gap: space.xs, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.sm },
  tokens: { gap: space.xs },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
