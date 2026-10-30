import { applyReview, type ReviewResult, type ReviewState, type SchedulePolicy } from '@/features/leitner/algorithm';
import type { VocabularyWithState } from '@/features/vocabulary/model';

import type { BoxNumber } from '@/constants/leitner';
import type { SqlDb } from '../types';
import {
  ENTRY_COLUMNS,
  STATE_COLUMNS,
  attachChildren,
  toReviewState,
  type EntryRow,
  type StateRow,
} from './vocabularyRepo';

const DUE_WHERE = 'v.archived_at IS NULL AND s.next_review_at <= ?';

/** Due queue in study order: reviews first, then never-seen cards; most overdue and lowest box first. */
export async function getDueQueue(db: SqlDb, nowIso: string, limit?: number): Promise<VocabularyWithState[]> {
  const rows = await db.all<EntryRow & StateRow>(
    `SELECT ${ENTRY_COLUMNS}, ${STATE_COLUMNS}
       FROM vocabulary v JOIN review_state s ON s.vocabulary_id = v.id
      WHERE ${DUE_WHERE}
      ORDER BY (s.review_count = 0), s.next_review_at, s.box_number, v.created_at
      ${limit ? 'LIMIT ?' : ''}`,
    limit ? [nowIso, limit] : [nowIso],
  );
  const entries = await attachChildren(db, rows);
  return rows.map((r, i) => ({ entry: entries[i], state: toReviewState(r) }));
}

export interface DueCounts {
  /** Cards seen before that are due. */
  reviews: number;
  /** Never-reviewed cards waiting for their first review. */
  fresh: number;
  /** Reviews more than a day late; still included in `reviews`. */
  total: number;
}

export async function countDue(db: SqlDb, nowIso: string): Promise<DueCounts> {
  const r = await db.get<{ reviews: number | null; fresh: number | null }>(
    `SELECT SUM(CASE WHEN s.review_count > 0 THEN 1 ELSE 0 END) AS reviews,
            SUM(CASE WHEN s.review_count = 0 THEN 1 ELSE 0 END) AS fresh
       FROM vocabulary v JOIN review_state s ON s.vocabulary_id = v.id WHERE ${DUE_WHERE}`,
    [nowIso],
  );
  const reviews = r?.reviews ?? 0;
  const fresh = r?.fresh ?? 0;
  return { reviews, fresh, total: reviews + fresh };
}

export interface RecordReviewInput {
  /** Unique per card presentation; makes retries and double taps idempotent. */
  submissionId: string;
  vocabularyId: string;
  result: ReviewResult;
  reviewedAt: string;
  sessionId?: string | null;
  /** If given, the write is refused when the card has been reviewed since it was loaded. */
  expectedReviewCount?: number;
  policy: SchedulePolicy;
}

export type RecordReviewOutcome =
  | { status: 'recorded'; state: ReviewState }
  | { status: 'duplicate' | 'stale'; state: ReviewState }
  | { status: 'missing' };

async function loadState(tx: SqlDb, vocabularyId: string): Promise<ReviewState | null> {
  const row = await tx.get<StateRow>(`SELECT ${STATE_COLUMNS} FROM review_state s WHERE s.vocabulary_id = ?`, [vocabularyId]);
  return row ? toReviewState(row) : null;
}

/**
 * Writes the ReviewLog row and the new ReviewState in ONE transaction.
 * Either both are saved or neither; repeating a submission changes nothing.
 */
export async function recordReview(db: SqlDb, input: RecordReviewInput): Promise<RecordReviewOutcome> {
  return db.transaction(async (tx) => {
    const current = await loadState(tx, input.vocabularyId);
    if (!current) return { status: 'missing' } as const;

    const seen = await tx.get('SELECT 1 AS x FROM review_log WHERE id = ?', [input.submissionId]);
    if (seen) return { status: 'duplicate', state: current } as const;

    if (input.expectedReviewCount !== undefined && current.reviewCount !== input.expectedReviewCount) {
      return { status: 'stale', state: current } as const;
    }

    const { state, log } = applyReview(current, input.result, input.reviewedAt, input.policy);
    await tx.run(
      `UPDATE review_state SET box_number=?, next_review_at=?, last_reviewed_at=?, correct_count=?,
         incorrect_count=?, review_count=?, updated_at=? WHERE vocabulary_id=?`,
      [state.boxNumber, state.nextReviewAt, state.lastReviewedAt, state.correctCount, state.incorrectCount, state.reviewCount, state.updatedAt, state.vocabularyId],
    );
    await tx.run(
      `INSERT INTO review_log (id, vocabulary_id, reviewed_at, result, box_before, box_after, scheduled_at_before, session_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [input.submissionId, log.vocabularyId, log.reviewedAt, log.result, log.boxBefore, log.boxAfter, log.scheduledAtBefore, input.sessionId ?? null],
    );
    return { status: 'recorded', state } as const;
  });
}

export interface ReviewTotals {
  correct: number;
  incorrect: number;
}

export async function reviewTotalsBetween(db: SqlDb, fromIso: string, toIso: string): Promise<ReviewTotals> {
  const r = await db.get<{ correct: number | null; incorrect: number | null }>(
    `SELECT SUM(CASE WHEN result='correct' THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN result='incorrect' THEN 1 ELSE 0 END) AS incorrect
       FROM review_log WHERE reviewed_at >= ? AND reviewed_at < ?`,
    [fromIso, toIso],
  );
  return { correct: r?.correct ?? 0, incorrect: r?.incorrect ?? 0 };
}

export async function reviewTimestampsSince(db: SqlDb, sinceIso: string): Promise<{ at: string; result: ReviewResult }[]> {
  return db.all<{ at: string; result: ReviewResult }>(
    'SELECT reviewed_at AS at, result FROM review_log WHERE reviewed_at >= ? ORDER BY reviewed_at',
    [sinceIso],
  );
}

export async function boxHistory(db: SqlDb, vocabularyId: string, limit = 10) {
  return db.all<{ reviewedAt: string; result: ReviewResult; boxBefore: BoxNumber; boxAfter: BoxNumber }>(
    `SELECT reviewed_at AS reviewedAt, result, box_before AS boxBefore, box_after AS boxAfter
       FROM review_log WHERE vocabulary_id = ? ORDER BY reviewed_at DESC LIMIT ?`,
    [vocabularyId, limit],
  );
}
