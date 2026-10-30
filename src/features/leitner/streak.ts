import { shiftDayKey } from '@/utils/dates';

/**
 * Consecutive study days ending today. A day with no activity yet today does
 * not break the streak (it ends yesterday), so opening the app in the morning
 * never shows a "lost" streak.
 */
export function computeStreak(activeDayKeys: Iterable<string>, todayKey: string): number {
  const days = new Set(activeDayKeys);
  let cursor = days.has(todayKey) ? todayKey : shiftDayKey(todayKey, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/** Last `count` day keys ending today, oldest first. */
export function lastDays(todayKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDayKey(todayKey, i - (count - 1)));
}
