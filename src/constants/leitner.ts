/**
 * Leitner policy. Everything a product owner may want to tune lives here,
 * so the algorithm module stays free of magic numbers.
 */

export type BoxNumber = 1 | 2 | 3 | 4 | 5;

export const BOX_NUMBERS: readonly BoxNumber[] = [1, 2, 3, 4, 5];
export const FIRST_BOX: BoxNumber = 1;
export const LAST_BOX: BoxNumber = 5;

/**
 * Interval (in local calendar days) applied when a card ENTERS the given box.
 * These are the app's initial policy, not a claim of optimality.
 */
export const BOX_INTERVAL_DAYS: Readonly<Record<BoxNumber, number>> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
};

/**
 * A never-reviewed card moves 1 -> 2 on its first success (as every correct
 * answer does) but is scheduled only this many days out, so a fresh word is
 * seen again tomorrow rather than after the box-2 interval.
 */
export const FIRST_SUCCESS_INTERVAL_DAYS = 1;

export const DEFAULT_DAILY_NEW_TARGET = 10;
export const MIN_DAILY_NEW_TARGET = 1;
export const MAX_DAILY_NEW_TARGET = 100;

/** Cards per review session; the rest stay due and can be resumed. */
export const REVIEW_SESSION_SIZE = 20;
