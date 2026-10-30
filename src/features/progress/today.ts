import type { BoxNumber } from '@/constants/leitner';
import { completedCountsBySkill, completedTimestampsSince, type Skill } from '@/database/repositories/practiceRepo';
import { countDue, reviewTimestampsSince, reviewTotalsBetween, type DueCounts } from '@/database/repositories/reviewRepo';
import { boxCounts, countCreatedBetween, countVocabulary } from '@/database/repositories/vocabularyRepo';
import type { SqlDb } from '@/database/types';
import { computeStreak, lastDays } from '@/features/leitner/streak';
import { recommendSkill } from '@/features/practice/recommend';
import type { Preferences } from '@/features/settings/preferences';
import { localDayKey, parseIso, startOfLocalDayMs, toIso } from '@/utils/dates';

export interface TodayData {
  due: DueCounts;
  totalWords: number;
  boxes: Record<BoxNumber, number>;
  newToday: number;
  newTarget: number;
  newRemaining: number;
  reviewedToday: { correct: number; incorrect: number };
  streak: number;
  week: { dayKey: string; active: boolean; isToday: boolean }[];
  nextDueAt: string | null;
  recommended: Skill | null;
}

const LOOKBACK_DAYS = 400;

export async function loadToday(db: SqlDb, nowIso: string, timeZone: string, prefs: Preferences): Promise<TodayData> {
  const now = parseIso(nowIso);
  const dayStart = toIso(startOfLocalDayMs(now, timeZone, 0));
  const nextDayStart = toIso(startOfLocalDayMs(now, timeZone, 1));
  const since = toIso(startOfLocalDayMs(now, timeZone, -LOOKBACK_DAYS));
  const weekAgo = toIso(startOfLocalDayMs(now, timeZone, -6));

  const [due, totalWords, boxes, newToday, reviewedToday, reviews, practices, recent, next] = await Promise.all([
    countDue(db, nowIso),
    countVocabulary(db),
    boxCounts(db),
    countCreatedBetween(db, dayStart, nextDayStart),
    reviewTotalsBetween(db, dayStart, nextDayStart),
    reviewTimestampsSince(db, since),
    completedTimestampsSince(db, since),
    completedCountsBySkill(db, weekAgo),
    db.get<{ at: string | null }>(
      `SELECT MIN(s.next_review_at) AS at FROM review_state s JOIN vocabulary v ON v.id = s.vocabulary_id
        WHERE v.archived_at IS NULL AND s.next_review_at > ?`,
      [nowIso],
    ),
  ]);

  const active = new Set<string>([...reviews.map((r) => localDayKey(parseIso(r.at), timeZone)), ...practices.map((p) => localDayKey(parseIso(p), timeZone))]);
  const todayKey = localDayKey(now, timeZone);
  return {
    due,
    totalWords,
    boxes,
    newToday,
    newTarget: prefs.dailyNewTarget,
    newRemaining: Math.max(0, prefs.dailyNewTarget - newToday),
    reviewedToday,
    streak: computeStreak(active, todayKey),
    week: lastDays(todayKey, 7).map((k) => ({ dayKey: k, active: active.has(k), isToday: k === todayKey })),
    nextDueAt: next?.at ?? null,
    recommended: recommendSkill(recent, totalWords),
  };
}
