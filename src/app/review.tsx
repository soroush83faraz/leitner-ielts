import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { BoxBadge, Tag } from '@/components/Chips';
import { Banner, ProgressBar, StateView } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { REVIEW_SESSION_SIZE } from '@/constants/leitner';
import { countDue, getDueQueue, recordReview, type DueCounts } from '@/database/repositories/reviewRepo';
import { getVocabularyMany } from '@/database/repositories/vocabularyRepo';
import { isDue, type ReviewResult } from '@/features/leitner/algorithm';
import { summarizeSession, type SessionOutcome } from '@/features/leitner/session';
import { isIncomplete, type VocabularyWithState } from '@/features/vocabulary/model';
import { useApp } from '@/state/AppProvider';
import { useEnglishSpeech } from '@/state/device';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { percent } from '@/utils/format';
import { newId, toPersianDigits } from '@/utils/text';

type Phase = 'loading' | 'reviewing' | 'summary' | 'empty' | 'error';

export default function ReviewScreen() {
  const { db, now, timeZone, bump } = useApp();
  const { colors } = useTheme();
  const { id: singleId } = useLocalSearchParams<{ id?: string }>();
  const speech = useEnglishSpeech();

  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<VocabularyWithState[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [outcomes, setOutcomes] = useState<SessionOutcome[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<DueCounts | null>(null);
  const [skipped, setSkipped] = useState(0);

  const sessionId = useRef(newId());
  // One id per card presentation: a retry after an error re-sends the same id, so it can never double-count.
  const submissionId = useRef(newId());
  const busy = useRef(false);

  // Bumped by "try again" / "continue reviewing" to load a fresh queue.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = singleId ? await getVocabularyMany(db, [String(singleId)]) : await getDueQueue(db, now(), REVIEW_SESSION_SIZE);
        if (!alive) return;
        setQueue(q);
        setIndex(0);
        setRevealed(false);
        setOutcomes([]);
        setSkipped(0);
        setSaveError(null);
        sessionId.current = newId();
        submissionId.current = newId();
        setPhase(q.length === 0 ? 'empty' : 'reviewing');
      } catch {
        if (alive) setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, now, singleId, attempt]);

  const restart = () => {
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  const current = queue[index];

  const goNext = useCallback(
    async (nextIndex: number) => {
      submissionId.current = newId();
      setRevealed(false);
      setSaveError(null);
      if (nextIndex >= queue.length) {
        setRemaining(await countDue(db, now()).catch(() => null));
        setPhase('summary');
      } else {
        setIndex(nextIndex);
      }
    },
    [db, now, queue.length],
  );

  const answer = async (result: ReviewResult) => {
    if (!current || !revealed || busy.current) return; // result only after an explicit reveal; ignore repeat taps
    busy.current = true;
    try {
      const out = await recordReview(db, {
        submissionId: submissionId.current,
        vocabularyId: current.entry.id,
        result,
        reviewedAt: now(),
        sessionId: sessionId.current,
        expectedReviewCount: current.state.reviewCount,
        policy: { timeZone },
      });
      if (out.status === 'recorded') {
        setOutcomes((o) => [...o, { vocabularyId: current.entry.id, term: current.entry.term, meaningFa: current.entry.meaningFa, result }]);
        Haptics.selectionAsync().catch(() => undefined);
      } else {
        setSkipped((n) => n + 1); // already recorded elsewhere or card removed: nothing changed here
      }
      bump();
      await goNext(index + 1);
    } catch {
      setSaveError('ذخیره‌ی نتیجه انجام نشد. چیزی تغییر نکرده است؛ دوباره بزنید.');
    } finally {
      busy.current = false;
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (phase === 'loading') {
    return (
      <Screen fixed>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (phase === 'error') {
    return (
      <Screen title="مرور" back={close} fixed>
        <StateView kind="error" title="بارگذاری کارت‌ها ممکن نشد" message="داده‌های شما سالم است." actionLabel="تلاش دوباره" onAction={restart} />
      </Screen>
    );
  }
  if (phase === 'empty') {
    return (
      <Screen title="مرور" back={close} fixed>
        <StateView
          kind="empty"
          title="کارتی برای مرور نیست"
          message="همه‌ی مرورهای امروز انجام شده. می‌توانید واژه‌ی تازه اضافه کنید یا یک تمرین کوتاه انجام دهید."
          actionLabel="افزودن واژه"
          onAction={() => router.replace('/add')}
          secondaryLabel="رفتن به تمرین"
          onSecondary={() => router.replace('/practice')}
        />
      </Screen>
    );
  }
  if (phase === 'summary') {
    const s = summarizeSession(outcomes);
    const more = remaining?.total ?? 0;
    return (
      <Screen
        title="پایان مرور"
        footer={
          <>
            {more > 0 && !singleId ? <Button label={`ادامه‌ی مرور (${toPersianDigits(more)} کارت مانده)`} icon="play" onPress={restart} /> : null}
            <Button label="بازگشت" variant={more > 0 && !singleId ? 'secondary' : 'primary'} onPress={close} />
          </>
        }
      >
        <Reveal>
          <Card>
            <Text variant="heading" accessibilityRole="header">
              {s.total === 0 ? 'نتیجه‌ای ثبت نشد' : `${toPersianDigits(s.total)} کارت مرور شد`}
            </Text>
            {s.total > 0 ? (
              <>
                <View style={styles.rowGap}>
                  <Icon name="check-circle" tone="success" />
                  <Text>می‌دانستم: {toPersianDigits(s.correct)}</Text>
                </View>
                <View style={styles.rowGap}>
                  <Icon name="x-circle" tone="danger" />
                  <Text>نمی‌دانستم: {toPersianDigits(s.incorrect)}</Text>
                </View>
                <Text tone="muted">دقت این جلسه: {percent(s.correct, s.total)} از {toPersianDigits(s.total)} پاسخ.</Text>
              </>
            ) : null}
            {skipped > 0 ? <Text variant="caption" tone="muted">{toPersianDigits(skipped)} کارت قبلاً ثبت شده بود و دوباره حساب نشد.</Text> : null}
          </Card>
        </Reveal>
        {s.missed.length > 0 ? (
          <Reveal delay={90} style={styles.gap}>
            <Text variant="heading">برای جعبه‌ی ۱ برگشتند</Text>
            <Text variant="caption" tone="muted">فردا دوباره می‌بینیدشان.</Text>
            {s.missed.map((m) => (
              <View key={m.vocabularyId} style={[styles.missed, { borderColor: colors.border }]}>
                <EnText variant="bodyStrong" serif>
                  {m.term}
                </EnText>
                <Text tone="muted" style={styles.flex}>
                  {m.meaningFa ?? ''}
                </Text>
              </View>
            ))}
          </Reveal>
        ) : null}
      </Screen>
    );
  }

  const { entry, state } = current;
  const notDue = !isDue(state, now());
  const hint = entry.examples[0]?.sentence ?? entry.sourceSentence;

  return (
    <Screen
      title="مرور"
      back={close}
      right={<Text tone="muted">{toPersianDigits(index + 1)} از {toPersianDigits(queue.length)}</Text>}
      footer={
        revealed ? (
          <>
            {saveError ? <Banner kind="danger" text={saveError} /> : null}
            <View style={styles.answers}>
              <View style={styles.flex}>
                <Button label="نمی‌دانستم" icon="x" variant="danger" onPress={() => answer('incorrect')} hint="کارت به جعبه‌ی ۱ برمی‌گردد" />
              </View>
              <View style={styles.flex}>
                <Button label="می‌دانستم" icon="check" variant="success" onPress={() => answer('correct')} hint="کارت یک جعبه بالا می‌رود" />
              </View>
            </View>
            <Text variant="caption" tone="muted" center>
              نتیجه را خودتان ثبت می‌کنید؛ هیچ چیز خودکار ذخیره نمی‌شود.
            </Text>
          </>
        ) : (
          <Button label="نمایش پاسخ" icon="eye" onPress={() => setRevealed(true)} hint="اول سعی کنید معنی را به یاد بیاورید" />
        )
      }
    >
      <ProgressBar value={index} max={queue.length} label={`کارت ${index + 1} از ${queue.length}`} />
      {singleId && notDue ? (
        <Banner kind="warn" text="موعد مرور این کارت هنوز نرسیده است. ثبت نتیجه، زمان‌بندی آن را تغییر می‌دهد." />
      ) : null}

      <Reveal key={entry.id + String(index)} style={styles.flex}>
        <Card style={styles.card}>
          <View style={styles.meta}>
            <BoxBadge box={state.boxNumber} />
            {state.reviewCount === 0 ? <Tag label="واژه‌ی تازه" kind="info" /> : null}
            {isIncomplete(entry) ? <Tag label="معنی ثبت نشده" kind="warn" /> : null}
          </View>

          <View style={[styles.body, !revealed && styles.bodyCentered]}>
            <View style={styles.termBlock}>
              <EnText serif size={44} variant="display" center accessibilityRole="header" accessibilityLanguage="en">
                {entry.term}
              </EnText>
              {entry.ipa ? (
                <EnText tone="muted" center accessibilityLanguage="en">
                  {entry.ipa}
                </EnText>
              ) : null}
              <View style={styles.termMeta}>
                {entry.partOfSpeech ? <Tag label={entry.partOfSpeech} /> : null}
                {speech.available ? (
                  <IconButton icon="volume-2" label="پخش تلفظ" onPress={() => speech.speak(entry.term)} tone="primary" />
                ) : null}
              </View>
            </View>

            {!revealed && hint ? (
              <View style={[styles.context, { backgroundColor: colors.sunken }]}>
                <EnText serif italic center accessibilityLanguage="en">
                  {hint}
                </EnText>
              </View>
            ) : null}

            {!revealed ? (
              <Text tone="muted" center style={styles.prompt}>
                معنی را در ذهن بیاورید، بعد پاسخ را ببینید.
              </Text>
            ) : (
              <Reveal style={styles.gap}>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text variant="title" center accessibilityLiveRegion="polite">
                  {entry.meaningFa ?? 'معنی فارسی ثبت نشده است'}
                </Text>
                {entry.definitionEn ? (
                  <EnText tone="muted" center accessibilityLanguage="en">
                    {entry.definitionEn}
                  </EnText>
                ) : null}
                {entry.examples.slice(0, 2).map((e, i) => (
                  <View key={i} style={[styles.example, { backgroundColor: colors.sunken }]}>
                    <EnText serif italic accessibilityLanguage="en">
                      {e.sentence}
                    </EnText>
                    {e.translationFa ? <Text variant="caption" tone="muted">{e.translationFa}</Text> : null}
                  </View>
                ))}
                {entry.collocations.length > 0 ? (
                  <EnText tone="muted" center variant="label" accessibilityLanguage="en">
                    {entry.collocations.join('  ·  ')}
                  </EnText>
                ) : null}
                {isIncomplete(entry) ? (
                  <Button label="ویرایش کارت" variant="quiet" block={false} icon="edit-2" onPress={() => router.push({ pathname: '/word/edit/[id]', params: { id: entry.id } })} />
                ) : null}
              </Reveal>
            )}
          </View>
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.sm },
  rowGap: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  answers: { flexDirection: 'row', gap: space.md },
  card: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  body: { flex: 1, gap: space.lg, paddingTop: space.lg },
  bodyCentered: { justifyContent: 'center' },
  termBlock: { alignItems: 'center', gap: space.xs },
  termMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  context: { padding: space.lg, borderRadius: 16, gap: space.xs },
  prompt: { marginTop: space.md },
  divider: { height: 1, marginVertical: space.sm },
  example: { gap: 2, padding: space.md, borderRadius: 12 },
  missed: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1 },
});
