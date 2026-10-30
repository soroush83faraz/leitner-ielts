/**
 * Pure Leitner scheduling. No React, no SQL, no clock access: callers pass
 * `now` / `reviewedAt` and the time zone explicitly.
 */
import {
  BOX_INTERVAL_DAYS,
  FIRST_BOX,
  FIRST_SUCCESS_INTERVAL_DAYS,
  LAST_BOX,
  type BoxNumber,
} from '@/constants/leitner';
import { parseIso, startOfLocalDayMs, toIso } from '@/utils/dates';

export type ReviewResult = 'correct' | 'incorrect';

export interface ReviewState {
  vocabularyId: string;
  boxNumber: BoxNumber;
  /** ISO-8601 UTC. */
  nextReviewAt: string;
  lastReviewedAt: string | null;
  correctCount: number;
  incorrectCount: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewLogDraft {
  vocabularyId: string;
  reviewedAt: string;
  result: ReviewResult;
  boxBefore: BoxNumber;
  boxAfter: BoxNumber;
  scheduledAtBefore: string;
}

export interface SchedulePolicy {
  timeZone: string;
}

/** A card that has never been reviewed. */
export function isNewCard(state: Pick<ReviewState, 'reviewCount'>): boolean {
  return state.reviewCount === 0;
}

/** New cards start in box 1 and are available for their first review immediately. */
export function createInitialState(vocabularyId: string, nowIso: string): ReviewState {
  return {
    vocabularyId,
    boxNumber: FIRST_BOX,
    nextReviewAt: nowIso,
    lastReviewedAt: null,
    correctCount: 0,
    incorrectCount: 0,
    reviewCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** `due`: nextReviewAt is at or before the current time. */
export function isDue(state: Pick<ReviewState, 'nextReviewAt'>, nowIso: string): boolean {
  return parseIso(state.nextReviewAt) <= parseIso(nowIso);
}

export function destinationBox(box: BoxNumber, result: ReviewResult): BoxNumber {
  if (result === 'incorrect') return FIRST_BOX;
  return Math.min(box + 1, LAST_BOX) as BoxNumber;
}

/**
 * Next due instant: local midnight, `days` calendar days after the local date
 * of the review. Always derived from the real review time, never from the old
 * due date, so overdue cards are not "caught up" by their lateness.
 */
export function computeNextReviewAt(
  reviewedAtIso: string,
  days: number,
  policy: SchedulePolicy,
): string {
  return toIso(startOfLocalDayMs(parseIso(reviewedAtIso), policy.timeZone, days));
}

export function intervalDaysFor(state: Pick<ReviewState, 'reviewCount'>, result: ReviewResult, box: BoxNumber): number {
  if (result === 'correct' && isNewCard(state)) return FIRST_SUCCESS_INTERVAL_DAYS;
  return BOX_INTERVAL_DAYS[box];
}

export function applyReview(
  state: ReviewState,
  result: ReviewResult,
  reviewedAtIso: string,
  policy: SchedulePolicy,
): { state: ReviewState; log: ReviewLogDraft } {
  const boxAfter = destinationBox(state.boxNumber, result);
  const days = intervalDaysFor(state, result, boxAfter);
  const next: ReviewState = {
    ...state,
    boxNumber: boxAfter,
    nextReviewAt: computeNextReviewAt(reviewedAtIso, days, policy),
    lastReviewedAt: reviewedAtIso,
    correctCount: state.correctCount + (result === 'correct' ? 1 : 0),
    incorrectCount: state.incorrectCount + (result === 'incorrect' ? 1 : 0),
    reviewCount: state.reviewCount + 1,
    updatedAt: reviewedAtIso,
  };
  return {
    state: next,
    log: {
      vocabularyId: state.vocabularyId,
      reviewedAt: reviewedAtIso,
      result,
      boxBefore: state.boxNumber,
      boxAfter,
      scheduledAtBefore: state.nextReviewAt,
    },
  };
}

/** Whole local calendar days a card is overdue (0 when due today or not due). */
export function daysOverdue(
  state: Pick<ReviewState, 'nextReviewAt'>,
  nowIso: string,
  policy: SchedulePolicy,
): number {
  const dueDay = startOfLocalDayMs(parseIso(state.nextReviewAt), policy.timeZone, 0);
  const today = startOfLocalDayMs(parseIso(nowIso), policy.timeZone, 0);
  return Math.max(0, Math.round((today - dueDay) / 86_400_000));
}

/**
 * Queue order: reviews before never-seen cards, then most-overdue first, then
 * lower boxes first (the ones most at risk of being forgotten).
 */
export function compareDueQueue(
  a: Pick<ReviewState, 'reviewCount' | 'nextReviewAt' | 'boxNumber'>,
  b: Pick<ReviewState, 'reviewCount' | 'nextReviewAt' | 'boxNumber'>,
): number {
  const aNew = isNewCard(a) ? 1 : 0;
  const bNew = isNewCard(b) ? 1 : 0;
  if (aNew !== bNew) return aNew - bNew;
  const byDue = parseIso(a.nextReviewAt) - parseIso(b.nextReviewAt);
  if (byDue !== 0) return byDue;
  return a.boxNumber - b.boxNumber;
}
