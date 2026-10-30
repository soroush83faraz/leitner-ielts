import type { SqlDb } from '../types';

export type Skill = 'reading' | 'listening' | 'writing' | 'speaking';
export const SKILLS: readonly Skill[] = ['reading', 'listening', 'writing', 'speaking'];

export interface PracticeRecord {
  id: string;
  skill: Skill;
  activityType: string;
  targetVocabularyIds: string[];
  prompt: string;
  payload: unknown;
  userResponse: string | null;
  feedback: unknown;
  scoreCorrect: number | null;
  scoreTotal: number | null;
  status: 'in_progress' | 'completed';
  createdAt: string;
  completedAt: string | null;
}

interface Row {
  id: string;
  skill: Skill;
  activityType: string;
  ids: string;
  prompt: string;
  payload: string | null;
  userResponse: string | null;
  feedback: string | null;
  scoreCorrect: number | null;
  scoreTotal: number | null;
  status: 'in_progress' | 'completed';
  createdAt: string;
  completedAt: string | null;
}

const COLS = `id, skill, activity_type AS activityType, target_vocabulary_ids AS ids, prompt, payload,
  user_response AS userResponse, feedback, score_correct AS scoreCorrect, score_total AS scoreTotal,
  status, created_at AS createdAt, completed_at AS completedAt`;

function parseJson(s: string | null): unknown {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function toRecord(r: Row): PracticeRecord {
  const ids = parseJson(r.ids);
  return {
    id: r.id,
    skill: r.skill,
    activityType: r.activityType,
    targetVocabularyIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [],
    prompt: r.prompt,
    payload: parseJson(r.payload),
    userResponse: r.userResponse,
    feedback: parseJson(r.feedback),
    scoreCorrect: r.scoreCorrect,
    scoreTotal: r.scoreTotal,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  };
}

export interface NewPractice {
  id: string;
  skill: Skill;
  activityType: string;
  targetVocabularyIds: string[];
  prompt: string;
  payload?: unknown;
  createdAt: string;
}

export async function createPractice(db: SqlDb, p: NewPractice): Promise<void> {
  await db.run(
    `INSERT INTO practice_session (id, skill, activity_type, target_vocabulary_ids, prompt, payload, status, created_at)
     VALUES (?,?,?,?,?,?, 'in_progress', ?)`,
    [p.id, p.skill, p.activityType, JSON.stringify(p.targetVocabularyIds), p.prompt, p.payload === undefined ? null : JSON.stringify(p.payload), p.createdAt],
  );
}

export interface PracticeCompletion {
  userResponse?: string | null;
  feedback?: unknown;
  scoreCorrect?: number | null;
  scoreTotal?: number | null;
  completedAt: string;
}

/** Idempotent: completing twice keeps the first completion. */
export async function completePractice(db: SqlDb, id: string, c: PracticeCompletion): Promise<void> {
  await db.run(
    `UPDATE practice_session SET status='completed', user_response=?, feedback=?, score_correct=?, score_total=?, completed_at=?
      WHERE id=? AND status='in_progress'`,
    [c.userResponse ?? null, c.feedback === undefined ? null : JSON.stringify(c.feedback), c.scoreCorrect ?? null, c.scoreTotal ?? null, c.completedAt, id],
  );
}

export async function listPractice(db: SqlDb, opts: { skill?: Skill; limit?: number; completedOnly?: boolean } = {}): Promise<PracticeRecord[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.skill) {
    where.push('skill = ?');
    params.push(opts.skill);
  }
  if (opts.completedOnly) where.push("status = 'completed'");
  params.push(opts.limit ?? 200);
  const rows = await db.all<Row>(
    `SELECT ${COLS} FROM practice_session ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
    params,
  );
  return rows.map(toRecord);
}

export async function completedCountsBySkill(db: SqlDb, sinceIso?: string): Promise<Record<Skill, number>> {
  const rows = await db.all<{ skill: Skill; n: number }>(
    `SELECT skill, COUNT(*) AS n FROM practice_session WHERE status='completed' ${sinceIso ? 'AND completed_at >= ?' : ''} GROUP BY skill`,
    sinceIso ? [sinceIso] : [],
  );
  const out: Record<Skill, number> = { reading: 0, listening: 0, writing: 0, speaking: 0 };
  for (const r of rows) out[r.skill] = r.n;
  return out;
}

export async function completedTimestampsSince(db: SqlDb, sinceIso: string): Promise<string[]> {
  const rows = await db.all<{ at: string }>(
    "SELECT completed_at AS at FROM practice_session WHERE status='completed' AND completed_at >= ?",
    [sinceIso],
  );
  return rows.map((r) => r.at);
}

export interface FinishedPractice extends NewPractice, PracticeCompletion {}

/** Saves a finished activity atomically (insert + completion), so no half-finished rows pile up. */
export async function saveFinishedPractice(db: SqlDb, p: FinishedPractice): Promise<void> {
  await db.transaction(async (tx) => {
    await createPractice(tx, p);
    await completePractice(tx, p.id, p);
  });
}
