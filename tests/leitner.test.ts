import { BOX_INTERVAL_DAYS, type BoxNumber } from '@/constants/leitner';
import {
  applyReview,
  compareDueQueue,
  computeNextReviewAt,
  createInitialState,
  daysOverdue,
  destinationBox,
  isDue,
  type ReviewState,
} from '@/features/leitner/algorithm';
import { computeStreak } from '@/features/leitner/streak';
import { localDayKey, startOfLocalDayMs } from '@/utils/dates';

const UTC = { timeZone: 'UTC' };
const TEHRAN = { timeZone: 'Asia/Tehran' };
const NY = { timeZone: 'America/New_York' };

function reviewedCard(box: BoxNumber, over: Partial<ReviewState> = {}): ReviewState {
  return {
    ...createInitialState('v1', '2026-01-01T00:00:00.000Z'),
    boxNumber: box,
    reviewCount: 3,
    lastReviewedAt: '2026-01-01T10:00:00.000Z',
    ...over,
  };
}

describe('initial state', () => {
  it('starts in box 1, never reviewed, and is due immediately', () => {
    const s = createInitialState('v1', '2026-03-01T08:00:00.000Z');
    expect(s.boxNumber).toBe(1);
    expect(s.reviewCount).toBe(0);
    expect(s.lastReviewedAt).toBeNull();
    expect(isDue(s, '2026-03-01T08:00:00.000Z')).toBe(true);
  });
});

describe('box transitions', () => {
  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 5],
  ] as [BoxNumber, BoxNumber][])('correct moves box %i to %i', (from, to) => {
    expect(destinationBox(from, 'correct')).toBe(to);
    const { state } = applyReview(reviewedCard(from), 'correct', '2026-02-01T09:00:00.000Z', UTC);
    expect(state.boxNumber).toBe(to);
  });

  it.each([1, 2, 3, 4, 5] as BoxNumber[])('incorrect from box %i returns to box 1', (from) => {
    const { state } = applyReview(reviewedCard(from), 'incorrect', '2026-02-01T09:00:00.000Z', UTC);
    expect(state.boxNumber).toBe(1);
  });

  it('updates counters and writes a complete log', () => {
    const before = reviewedCard(3, { correctCount: 2, incorrectCount: 1 });
    const { state, log } = applyReview(before, 'correct', '2026-02-01T09:00:00.000Z', UTC);
    expect(state.correctCount).toBe(3);
    expect(state.incorrectCount).toBe(1);
    expect(state.reviewCount).toBe(4);
    expect(log).toMatchObject({ boxBefore: 3, boxAfter: 4, result: 'correct', scheduledAtBefore: before.nextReviewAt });
  });

  it('does not mutate its input', () => {
    const before = reviewedCard(2);
    const snapshot = JSON.stringify(before);
    applyReview(before, 'correct', '2026-02-01T09:00:00.000Z', UTC);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('scheduling intervals', () => {
  it.each([
    [2, 3, 4],
    [3, 4, 8],
    [4, 5, 16],
    [5, 5, 16],
  ] as [BoxNumber, BoxNumber, number][])('after a correct review from box %i the card waits for box %i interval', (from, to, days) => {
    expect(BOX_INTERVAL_DAYS[to]).toBe(days);
    const { state } = applyReview(reviewedCard(from), 'correct', '2026-02-01T09:00:00.000Z', UTC);
    expect(state.nextReviewAt).toBe(computeNextReviewAt('2026-02-01T09:00:00.000Z', days, UTC));
  });

  it('first success of a new card is due one day later (new-card policy)', () => {
    const fresh = createInitialState('v1', '2026-02-01T08:00:00.000Z');
    const { state } = applyReview(fresh, 'correct', '2026-02-01T09:00:00.000Z', UTC);
    expect(state.boxNumber).toBe(2);
    expect(state.nextReviewAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('a failed review schedules the box-1 interval (1 day)', () => {
    const { state } = applyReview(reviewedCard(4), 'incorrect', '2026-02-01T09:00:00.000Z', UTC);
    expect(state.nextReviewAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('overdue cards schedule from the actual review time, not the old due date', () => {
    const overdue = reviewedCard(2, { nextReviewAt: '2026-01-03T00:00:00.000Z' });
    const { state } = applyReview(overdue, 'correct', '2026-02-10T15:00:00.000Z', UTC);
    // box 3 => 4 days after 10 Feb, not after 3 Jan
    expect(state.nextReviewAt).toBe('2026-02-14T00:00:00.000Z');
  });

  it('rolls over month and year ends', () => {
    expect(computeNextReviewAt('2026-12-30T10:00:00.000Z', 4, UTC)).toBe('2027-01-03T00:00:00.000Z');
    expect(computeNextReviewAt('2028-02-27T10:00:00.000Z', 2, UTC)).toBe('2028-02-29T00:00:00.000Z');
  });
});

describe('time zones, midnight and DST', () => {
  it('uses the local date, not the UTC date, for a late-evening review in Tehran', () => {
    // 22:30 UTC on 1 Jun is 02:00 on 2 Jun in Tehran (UTC+3:30 in 2026, no DST).
    const reviewed = '2026-06-01T22:30:00.000Z';
    expect(localDayKey(Date.parse(reviewed), 'Asia/Tehran')).toBe('2026-06-02');
    const next = computeNextReviewAt(reviewed, 1, TEHRAN);
    // local midnight of 3 Jun in Tehran = 2 Jun 20:30 UTC
    expect(next).toBe('2026-06-02T20:30:00.000Z');
  });

  it('a review just before and just after local midnight lands on different days', () => {
    const before = computeNextReviewAt('2026-03-10T03:59:00.000Z', 1, NY); // 23:59 EDT on 9 Mar? (EDT from 8 Mar)
    const after = computeNextReviewAt('2026-03-10T04:01:00.000Z', 1, NY);
    expect(Date.parse(after) - Date.parse(before)).toBe(86_400_000);
  });

  it('keeps local midnight across the spring-forward boundary (23h day)', () => {
    // US DST starts 8 Mar 2026. Review on 7 Mar noon local; +2 days => 9 Mar 00:00 EDT.
    const reviewed = '2026-03-07T17:00:00.000Z';
    const next = computeNextReviewAt(reviewed, 2, NY);
    expect(next).toBe('2026-03-09T04:00:00.000Z');
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(Date.parse(next))).toBe('00');
  });

  it('keeps local midnight across the fall-back boundary (25h day)', () => {
    // US DST ends 1 Nov 2026. Review 31 Oct noon local; +2 days => 2 Nov 00:00 EST.
    const next = computeNextReviewAt('2026-10-31T16:00:00.000Z', 2, NY);
    expect(next).toBe('2026-11-02T05:00:00.000Z');
  });

  it('startOfLocalDayMs is idempotent', () => {
    const t = Date.parse('2026-07-15T13:13:13.000Z');
    const s = startOfLocalDayMs(t, 'Europe/London');
    expect(startOfLocalDayMs(s, 'Europe/London')).toBe(s);
  });

  it('daysOverdue counts local calendar days and never goes negative', () => {
    const c = reviewedCard(2, { nextReviewAt: '2026-02-01T00:00:00.000Z' });
    expect(daysOverdue(c, '2026-02-01T23:00:00.000Z', UTC)).toBe(0);
    expect(daysOverdue(c, '2026-02-04T01:00:00.000Z', UTC)).toBe(3);
    expect(daysOverdue(c, '2026-01-20T01:00:00.000Z', UTC)).toBe(0);
  });
});

describe('due status', () => {
  it('is due exactly at nextReviewAt and not before', () => {
    const c = reviewedCard(2, { nextReviewAt: '2026-02-01T00:00:00.000Z' });
    expect(isDue(c, '2026-01-31T23:59:59.999Z')).toBe(false);
    expect(isDue(c, '2026-02-01T00:00:00.000Z')).toBe(true);
  });
});

describe('queue order', () => {
  it('puts reviews before new cards, then most-overdue, then lower box', () => {
    const newCard = reviewedCard(1, { reviewCount: 0, nextReviewAt: '2026-01-01T00:00:00.000Z' });
    const old = reviewedCard(3, { nextReviewAt: '2026-01-05T00:00:00.000Z' });
    const recent = reviewedCard(2, { nextReviewAt: '2026-01-09T00:00:00.000Z' });
    const sameDayLowBox = reviewedCard(1, { nextReviewAt: '2026-01-09T00:00:00.000Z' });
    const sorted = [newCard, recent, old, sameDayLowBox].sort(compareDueQueue);
    expect(sorted).toEqual([old, sameDayLowBox, recent, newCard]);
  });
});

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-05-10', '2026-05-09', '2026-05-08'], '2026-05-10')).toBe(3);
  });
  it('does not break when today has no activity yet', () => {
    expect(computeStreak(['2026-05-09', '2026-05-08'], '2026-05-10')).toBe(2);
  });
  it('stops at a gap and is 0 after a missed day', () => {
    expect(computeStreak(['2026-05-10', '2026-05-08'], '2026-05-10')).toBe(1);
    expect(computeStreak(['2026-05-07'], '2026-05-10')).toBe(0);
  });
});
