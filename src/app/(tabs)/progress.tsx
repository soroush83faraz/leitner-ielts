import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BoxStrip } from '@/components/BoxStrip';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chips';
import { StateView } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { completedCountsBySkill, listPractice, SKILLS } from '@/database/repositories/practiceRepo';
import { reviewTimestampsSince, reviewTotalsBetween } from '@/database/repositories/reviewRepo';
import { boxCounts, countVocabulary } from '@/database/repositories/vocabularyRepo';
import { SKILL_FA } from '@/features/practice/recommend';
import { RANGE_LABEL_FA, RANGE_PHRASE_FA, bucketReviewsByDay, summarizeProductiveUse, type RangeKey } from '@/features/progress/stats';
import { useData } from '@/state/useData';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { localDayKey, parseIso, startOfLocalDayMs, toIso } from '@/utils/dates';
import { percent, weekdayInitialFa } from '@/utils/format';
import { toPersianDigits } from '@/utils/text';

const RANGES: RangeKey[] = ['7', '30', '90', 'all'];
const EPOCH = '1970-01-01T00:00:00.000Z';

export default function ProgressScreen() {
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>('30');

  const { data, error, reload } = useData(
    async (c) => {
      const now = parseIso(c.nowIso);
      const from = range === 'all' ? EPOCH : toIso(startOfLocalDayMs(now, c.timeZone, -(Number(range) - 1)));
      const to = toIso(startOfLocalDayMs(now, c.timeZone, 1));
      const chartDays = Math.min(range === 'all' ? 30 : Number(range), 30);
      const chartFrom = toIso(startOfLocalDayMs(now, c.timeZone, -(chartDays - 1)));
      const [total, boxes, totals, chartRows, practice, writing] = await Promise.all([
        countVocabulary(c.db),
        boxCounts(c.db),
        reviewTotalsBetween(c.db, from, to),
        reviewTimestampsSince(c.db, chartFrom),
        completedCountsBySkill(c.db, range === 'all' ? undefined : from),
        listPractice(c.db, { completedOnly: true, limit: 500 }),
      ]);
      const inRange = writing.filter((p) => range === 'all' || (p.completedAt ?? '') >= from);
      return {
        total,
        boxes,
        totals,
        practice,
        chart: bucketReviewsByDay(chartRows, c.timeZone, localDayKey(now, c.timeZone), chartDays),
        productive: summarizeProductiveUse(inRange),
      };
    },
    [range],
  );

  return (
    <Screen title="پیشرفت" tabbed>
      {error && !data ? (
        <StateView kind="error" title="خواندن آمار ممکن نشد" message={error} actionLabel="تلاش دوباره" onAction={reload} />
      ) : !data ? (
        <StateView kind="loading" />
      ) : data.total === 0 && data.totals.correct + data.totals.incorrect === 0 ? (
        <StateView kind="empty" title="هنوز آماری نیست" message="بعد از افزودن واژه و اولین مرور، پیشرفت شما اینجا نشان داده می‌شود." />
      ) : (
        <>
          <ChipRow>
            {RANGES.map((r) => (
              <Chip key={r} label={RANGE_LABEL_FA[r]} selected={range === r} onPress={() => setRange(r)} />
            ))}
          </ChipRow>

          <View style={styles.gap}>
            <Text variant="heading">کتابخانه</Text>
            <Text>{toPersianDigits(data.total)} واژه و عبارت ذخیره‌شده (بدون بایگانی)</Text>
            <BoxStrip counts={data.boxes} />
          </View>

          <Card>
            <Text variant="heading">یادآوری (مرور لایتنر)</Text>
            {data.totals.correct + data.totals.incorrect === 0 ? (
              <Text tone="muted">در {RANGE_PHRASE_FA[range]} مروری ثبت نشده است.</Text>
            ) : (
              <>
                <Text>
                  دقت {percent(data.totals.correct, data.totals.correct + data.totals.incorrect)} — {toPersianDigits(data.totals.correct)} پاسخ درست از {toPersianDigits(data.totals.correct + data.totals.incorrect)} مرور در {RANGE_PHRASE_FA[range]}
                </Text>
                <Text variant="caption" tone="muted">
                  {toPersianDigits(data.totals.incorrect)} پاسخ نادرست. دقت فقط شامل مرورهایی است که خودتان ثبت کرده‌اید.
                </Text>
              </>
            )}
            {data.totals.correct + data.totals.incorrect > 0 ? <DayBars chart={data.chart} color={colors.primary} muted={colors.danger} track={colors.sunken} /> : null}
          </Card>

          <Card>
            <Text variant="heading">تمرین‌های انجام‌شده</Text>
            {SKILLS.map((s) => (
              <View key={s} style={styles.rowBetween}>
                <Text>{SKILL_FA[s]}</Text>
                <Text variant="bodyStrong">{toPersianDigits(data.practice[s])}</Text>
              </View>
            ))}
            <Text variant="caption" tone="muted">
              تعداد تمرین‌های کامل‌شده در {RANGE_PHRASE_FA[range]}.
            </Text>
          </Card>

          <Card>
            <Text variant="heading">کاربرد فعال (نوشتن و گفتار)</Text>
            {data.productive.sessions === 0 ? (
              <Text tone="muted">هنوز نوشته یا پاسخ گفتاری ذخیره نکرده‌اید.</Text>
            ) : (
              <>
                <Text>
                  {toPersianDigits(data.productive.distinctCorrectTerms.length)} واژه‌ی متفاوت در متن خودتان درست به کار رفته ({toPersianDigits(data.productive.sessions)} تمرین).
                </Text>
                {data.productive.distinctCorrectTerms.length > 0 ? (
                  <EnText tone="muted">{data.productive.distinctCorrectTerms.slice(0, 12).join(' · ')}</EnText>
                ) : null}
                <Text variant="caption" tone="muted">
                  {toPersianDigits(data.productive.correctUses)} کاربرد درست · {toPersianDigits(data.productive.incorrectUses)} نادرست · {toPersianDigits(data.productive.uncertainUses)} نامطمئن
                  {data.productive.withoutFeedback > 0 ? ` · ${toPersianDigits(data.productive.withoutFeedback)} تمرین بدون بازخورد` : ''}
                </Text>
              </>
            )}
            <Text variant="caption" tone="muted">
              رسیدن یک واژه به جعبه‌ی ۵ یعنی معنی‌اش را به یاد می‌آورید؛ نشان نمی‌دهد که آن را در نوشتن یا صحبت درست به کار می‌برید. این بخش فقط از متن‌های واقعاً ثبت‌شده‌ی شما و ارزیابی همان متن‌ها ساخته می‌شود.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

function DayBars({ chart, color, muted, track }: { chart: { dayKey: string; correct: number; incorrect: number }[]; color: string; muted: string; track: string }) {
  const max = Math.max(1, ...chart.map((d) => d.correct + d.incorrect));
  const total = chart.reduce((a, d) => a + d.correct + d.incorrect, 0);
  const every = chart.length > 14 ? 5 : 1;
  return (
    <View
      accessible
      accessibilityLabel={`نمودار مرور روزانه در ${chart.length} روز اخیر، مجموع ${total} مرور`}
      style={styles.bars}
    >
      {chart.map((d, i) => {
        const n = d.correct + d.incorrect;
        return (
          <View key={d.dayKey} style={styles.barCol}>
            <View style={[styles.barTrack, { backgroundColor: track }]}>
              <View style={{ height: `${(d.incorrect / max) * 100}%`, backgroundColor: muted }} />
              <View style={{ height: `${(d.correct / max) * 100}%`, backgroundColor: color }} />
            </View>
            <Text variant="caption" tone="muted" style={styles.barLabel}>
              {i % every === 0 || i === chart.length - 1 ? (chart.length <= 7 ? weekdayInitialFa(d.dayKey) : toPersianDigits(Number(d.dayKey.slice(8)))) : ' '}
            </Text>
            {n > 0 && chart.length <= 7 ? <Text variant="caption">{toPersianDigits(n)}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120, marginTop: space.sm },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 2 },
  barTrack: { width: '100%', flex: 1, borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'flex-end' },
  barLabel: { fontSize: 11, lineHeight: 16 },
});
