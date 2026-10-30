import type { ReviewResult } from '@/features/leitner/algorithm';
import { lastDays } from '@/features/leitner/streak';
import { localDayKey, parseIso } from '@/utils/dates';

export type RangeKey = '7' | '30' | '90' | 'all';

export const RANGE_LABEL_FA: Record<RangeKey, string> = { '7': '۷ روز', '30': '۳۰ روز', '90': '۹۰ روز', all: 'همه' };
export const RANGE_PHRASE_FA: Record<RangeKey, string> = { '7': '۷ روز اخیر', '30': '۳۰ روز اخیر', '90': '۹۰ روز اخیر', all: 'کل زمان' };

export interface DayBucket {
  dayKey: string;
  correct: number;
  incorrect: number;
}

/** Counts reviews per local day for the last `days` days (oldest first, zero-filled). */
export function bucketReviewsByDay(rows: { at: string; result: ReviewResult }[], timeZone: string, todayKey: string, days: number): DayBucket[] {
  const buckets = new Map(lastDays(todayKey, days).map((k) => [k, { dayKey: k, correct: 0, incorrect: 0 }]));
  for (const r of rows) {
    const b = buckets.get(localDayKey(parseIso(r.at), timeZone));
    if (!b) continue;
    if (r.result === 'correct') b.correct += 1;
    else b.incorrect += 1;
  }
  return [...buckets.values()];
}

export function accuracy(correct: number, incorrect: number): number | null {
  const total = correct + incorrect;
  return total === 0 ? null : correct / total;
}

interface FeedbackLike {
  vocabularyUse?: { term?: unknown; used?: unknown; correctness?: unknown }[];
}

export interface ProductiveUse {
  sessions: number;
  /** Distinct terms the learner used correctly in their own text, per the AI assessment. */
  distinctCorrectTerms: string[];
  /** Assessed uses, split by outcome. */
  correctUses: number;
  incorrectUses: number;
  uncertainUses: number;
  /** Sessions saved without AI feedback: counted as practice, not as evidence of correct use. */
  withoutFeedback: number;
}

/**
 * Productive use comes ONLY from recorded writing/speaking responses that got an
 * explicit per-word assessment. A high Leitner box never counts as productive mastery.
 */
export function summarizeProductiveUse(sessions: { skill: string; feedback: unknown }[]): ProductiveUse {
  const out: ProductiveUse = { sessions: 0, distinctCorrectTerms: [], correctUses: 0, incorrectUses: 0, uncertainUses: 0, withoutFeedback: 0 };
  const distinct = new Set<string>();
  for (const s of sessions) {
    if (s.skill !== 'writing' && s.skill !== 'speaking') continue;
    out.sessions += 1;
    const uses = (s.feedback as FeedbackLike | null)?.vocabularyUse;
    if (!Array.isArray(uses)) {
      out.withoutFeedback += 1;
      continue;
    }
    for (const u of uses) {
      if (u.used !== true) continue;
      if (u.correctness === 'correct') {
        out.correctUses += 1;
        if (typeof u.term === 'string') distinct.add(u.term.toLowerCase());
      } else if (u.correctness === 'incorrect') out.incorrectUses += 1;
      else out.uncertainUses += 1;
    }
  }
  out.distinctCorrectTerms = [...distinct].sort();
  return out;
}
