import { createInitialState, type ReviewState } from '@/features/leitner/algorithm';
import {
  vocabularyInputSchema,
  type EntryType,
  type Example,
  type Topic,
  type ValidVocabularyInput,
  type VocabularyEntry,
  type VocabularyInput,
  type VocabularyWithState,
  type WordFamilyItem,
} from '@/features/vocabulary/model';
import { newId, normalizeTerm, squash } from '@/utils/text';

import type { BoxNumber } from '@/constants/leitner';
import type { SqlDb, SqlValue } from '../types';

const ENTRY_COLUMNS = `
  v.id, v.term, v.normalized_term AS normalizedTerm, v.meaning_fa AS meaningFa,
  v.definition_en AS definitionEn, v.part_of_speech AS partOfSpeech, v.ipa,
  v.topic, v.entry_type AS entryType, v.source_sentence AS sourceSentence,
  v.source_type AS sourceType, v.created_at AS createdAt, v.updated_at AS updatedAt,
  v.archived_at AS archivedAt`;

const STATE_COLUMNS = `
  s.vocabulary_id AS vocabularyId, s.box_number AS boxNumber, s.next_review_at AS nextReviewAt,
  s.last_reviewed_at AS lastReviewedAt, s.correct_count AS correctCount,
  s.incorrect_count AS incorrectCount, s.review_count AS reviewCount,
  s.created_at AS stateCreatedAt, s.updated_at AS stateUpdatedAt`;

type EntryRow = Omit<VocabularyEntry, 'examples' | 'collocations' | 'wordFamily'>;
type StateRow = Omit<ReviewState, 'createdAt' | 'updatedAt'> & { stateCreatedAt: string; stateUpdatedAt: string };

/** Picks only state columns: the row may be a vocabulary+state join. */
export function toReviewState(row: StateRow): ReviewState {
  return {
    vocabularyId: row.vocabularyId,
    boxNumber: row.boxNumber,
    nextReviewAt: row.nextReviewAt,
    lastReviewedAt: row.lastReviewedAt,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    reviewCount: row.reviewCount,
    createdAt: row.stateCreatedAt,
    updatedAt: row.stateUpdatedAt,
  };
}

/** Persian text typed with Arabic keyboards uses ي/ك; store the Persian forms. */
export function normalizePersian(value: string): string {
  return value.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
}

function sanitize(input: VocabularyInput): ValidVocabularyInput {
  const parsed = vocabularyInputSchema.parse(input);
  return {
    ...parsed,
    term: squash(parsed.term),
    meaningFa: parsed.meaningFa ? normalizePersian(parsed.meaningFa) : null,
    examples: parsed.examples.map((e) => ({
      sentence: e.sentence,
      translationFa: e.translationFa ? normalizePersian(e.translationFa) : null,
    })),
  };
}

async function insertChildren(tx: SqlDb, id: string, v: ValidVocabularyInput) {
  for (const [i, e] of v.examples.entries()) {
    await tx.run(
      'INSERT INTO vocabulary_example (vocabulary_id, position, sentence, translation_fa) VALUES (?,?,?,?)',
      [id, i, e.sentence, e.translationFa],
    );
  }
  for (const [i, c] of v.collocations.entries()) {
    await tx.run('INSERT INTO vocabulary_collocation (vocabulary_id, position, text) VALUES (?,?,?)', [id, i, c]);
  }
  for (const [i, w] of v.wordFamily.entries()) {
    await tx.run(
      'INSERT INTO vocabulary_word_family (vocabulary_id, position, word, part_of_speech) VALUES (?,?,?,?)',
      [id, i, w.word, w.partOfSpeech],
    );
  }
}

async function deleteChildren(tx: SqlDb, id: string) {
  await tx.run('DELETE FROM vocabulary_example WHERE vocabulary_id = ?', [id]);
  await tx.run('DELETE FROM vocabulary_collocation WHERE vocabulary_id = ?', [id]);
  await tx.run('DELETE FROM vocabulary_word_family WHERE vocabulary_id = ?', [id]);
}

async function insertEntry(tx: SqlDb, v: ValidVocabularyInput, nowIso: string, id = newId()): Promise<string> {
  await tx.run(
    `INSERT INTO vocabulary (id, term, normalized_term, meaning_fa, definition_en, part_of_speech, ipa, topic,
       entry_type, source_sentence, source_type, created_at, updated_at, archived_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
    [
      id,
      v.term,
      normalizeTerm(v.term),
      v.meaningFa,
      v.definitionEn,
      v.partOfSpeech,
      v.ipa,
      v.topic,
      v.entryType,
      v.sourceSentence,
      v.sourceType,
      nowIso,
      nowIso,
    ],
  );
  await insertChildren(tx, id, v);
  const s = createInitialState(id, nowIso);
  await tx.run(
    `INSERT INTO review_state (vocabulary_id, box_number, next_review_at, last_reviewed_at, correct_count,
       incorrect_count, review_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, s.boxNumber, s.nextReviewAt, null, 0, 0, 0, nowIso, nowIso],
  );
  return id;
}

/** Creates the card and its Leitner state (box 1) atomically. */
export async function createVocabulary(db: SqlDb, input: VocabularyInput, nowIso: string): Promise<string> {
  const v = sanitize(input);
  return db.transaction((tx) => insertEntry(tx, v, nowIso));
}

/** All-or-nothing batch creation. Callers must have validated and de-duplicated. */
export async function createManyVocabulary(db: SqlDb, inputs: VocabularyInput[], nowIso: string): Promise<string[]> {
  const valid = inputs.map(sanitize);
  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const v of valid) ids.push(await insertEntry(tx, v, nowIso));
    return ids;
  });
}

export async function updateVocabulary(db: SqlDb, id: string, input: VocabularyInput, nowIso: string): Promise<boolean> {
  const v = sanitize(input);
  return db.transaction(async (tx) => {
    const res = await tx.run(
      `UPDATE vocabulary SET term=?, normalized_term=?, meaning_fa=?, definition_en=?, part_of_speech=?, ipa=?,
         topic=?, entry_type=?, source_sentence=?, updated_at=? WHERE id=?`,
      [
        v.term,
        normalizeTerm(v.term),
        v.meaningFa,
        v.definitionEn,
        v.partOfSpeech,
        v.ipa,
        v.topic,
        v.entryType,
        v.sourceSentence,
        nowIso,
        id,
      ],
    );
    if (res.changes === 0) return false;
    await deleteChildren(tx, id);
    await insertChildren(tx, id, v);
    return true; // review_state and review_log are deliberately untouched
  });
}

export async function setArchived(db: SqlDb, id: string, archived: boolean, nowIso: string): Promise<void> {
  await db.run('UPDATE vocabulary SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? nowIso : null, nowIso, id]);
}

/**
 * Permanent delete. The card's review history is kept (detached) so global
 * accuracy numbers stay truthful; other cards are never touched.
 */
export async function deleteVocabulary(db: SqlDb, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE review_log SET vocabulary_id = NULL WHERE vocabulary_id = ?', [id]);
    await deleteChildren(tx, id);
    await tx.run('DELETE FROM review_state WHERE vocabulary_id = ?', [id]);
    await tx.run('DELETE FROM vocabulary WHERE id = ?', [id]);
  });
}

async function attachChildren(db: SqlDb, rows: EntryRow[]): Promise<VocabularyEntry[]> {
  if (rows.length === 0) return [];
  const examples = new Map<string, Example[]>();
  const collocations = new Map<string, string[]>();
  const family = new Map<string, WordFamilyItem[]>();
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const ids = rows.slice(i, i + CHUNK).map((r) => r.id);
    const marks = ids.map(() => '?').join(',');
    const ex = await db.all<{ vid: string; sentence: string; tr: string | null }>(
      `SELECT vocabulary_id AS vid, sentence, translation_fa AS tr FROM vocabulary_example WHERE vocabulary_id IN (${marks}) ORDER BY position`,
      ids,
    );
    for (const e of ex) (examples.get(e.vid) ?? examples.set(e.vid, []).get(e.vid)!).push({ sentence: e.sentence, translationFa: e.tr });
    const co = await db.all<{ vid: string; text: string }>(
      `SELECT vocabulary_id AS vid, text FROM vocabulary_collocation WHERE vocabulary_id IN (${marks}) ORDER BY position`,
      ids,
    );
    for (const c of co) (collocations.get(c.vid) ?? collocations.set(c.vid, []).get(c.vid)!).push(c.text);
    const wf = await db.all<{ vid: string; word: string; pos: string | null }>(
      `SELECT vocabulary_id AS vid, word, part_of_speech AS pos FROM vocabulary_word_family WHERE vocabulary_id IN (${marks}) ORDER BY position`,
      ids,
    );
    for (const w of wf) (family.get(w.vid) ?? family.set(w.vid, []).get(w.vid)!).push({ word: w.word, partOfSpeech: w.pos });
  }
  return rows.map((r) => ({
    ...r,
    examples: examples.get(r.id) ?? [],
    collocations: collocations.get(r.id) ?? [],
    wordFamily: family.get(r.id) ?? [],
  }));
}

export async function getVocabulary(db: SqlDb, id: string): Promise<VocabularyWithState | null> {
  const row = await db.get<EntryRow & StateRow>(
    `SELECT ${ENTRY_COLUMNS}, ${STATE_COLUMNS} FROM vocabulary v JOIN review_state s ON s.vocabulary_id = v.id WHERE v.id = ?`,
    [id],
  );
  if (!row) return null;
  const [entry] = await attachChildren(db, [row]);
  return { entry, state: toReviewState(row) };
}

export async function getVocabularyMany(db: SqlDb, ids: string[]): Promise<VocabularyWithState[]> {
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  const rows = await db.all<EntryRow & StateRow>(
    `SELECT ${ENTRY_COLUMNS}, ${STATE_COLUMNS} FROM vocabulary v JOIN review_state s ON s.vocabulary_id = v.id WHERE v.id IN (${marks})`,
    ids,
  );
  const entries = await attachChildren(db, rows);
  return rows.map((r, i) => ({ entry: entries[i], state: toReviewState(r) }));
}

export type StatusFilter = 'all' | 'due' | 'new' | 'incomplete' | 'archived';

export interface ListFilters {
  search?: string;
  box?: BoxNumber | null;
  topic?: Topic | null;
  entryType?: EntryType | null;
  status?: StatusFilter;
  nowIso: string;
}

export interface VocabularyListItem {
  id: string;
  term: string;
  meaningFa: string | null;
  entryType: EntryType;
  topic: Topic | null;
  partOfSpeech: string | null;
  archivedAt: string | null;
  createdAt: string;
  boxNumber: BoxNumber;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listVocabulary(db: SqlDb, f: ListFilters): Promise<VocabularyListItem[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const status = f.status ?? 'all';
  where.push(status === 'archived' ? 'v.archived_at IS NOT NULL' : 'v.archived_at IS NULL');
  if (f.search && f.search.trim()) {
    const q = `%${escapeLike(normalizePersian(f.search.trim()))}%`;
    where.push(
      "(v.term LIKE ? ESCAPE '\\' OR v.meaning_fa LIKE ? ESCAPE '\\' OR v.definition_en LIKE ? ESCAPE '\\')",
    );
    params.push(q, q, q);
  }
  if (f.box) {
    where.push('s.box_number = ?');
    params.push(f.box);
  }
  if (f.topic) {
    where.push('v.topic = ?');
    params.push(f.topic);
  }
  if (f.entryType) {
    where.push('v.entry_type = ?');
    params.push(f.entryType);
  }
  if (status === 'due') {
    where.push('s.next_review_at <= ?');
    params.push(f.nowIso);
  } else if (status === 'new') {
    where.push('s.review_count = 0');
  } else if (status === 'incomplete') {
    where.push("(v.meaning_fa IS NULL OR v.meaning_fa = '')");
  }
  return db.all<VocabularyListItem>(
    `SELECT v.id, v.term, v.meaning_fa AS meaningFa, v.entry_type AS entryType, v.topic,
            v.part_of_speech AS partOfSpeech, v.archived_at AS archivedAt, v.created_at AS createdAt,
            s.box_number AS boxNumber, s.next_review_at AS nextReviewAt,
            s.last_reviewed_at AS lastReviewedAt, s.review_count AS reviewCount
       FROM vocabulary v JOIN review_state s ON s.vocabulary_id = v.id
      WHERE ${where.join(' AND ')}
      ORDER BY v.created_at DESC, v.rowid DESC`,
    params,
  );
}

export interface DuplicateHit {
  id: string;
  term: string;
  meaningFa: string | null;
  archived: boolean;
}

/** Existing entries (archived included) sharing the normalised term. */
export async function findByNormalizedTerm(db: SqlDb, term: string, excludeId?: string): Promise<DuplicateHit[]> {
  const rows = await db.all<{ id: string; term: string; meaningFa: string | null; archivedAt: string | null }>(
    `SELECT id, term, meaning_fa AS meaningFa, archived_at AS archivedAt FROM vocabulary
      WHERE normalized_term = ? AND id <> ? ORDER BY created_at`,
    [normalizeTerm(term), excludeId ?? ''],
  );
  return rows.map((r) => ({ id: r.id, term: r.term, meaningFa: r.meaningFa, archived: r.archivedAt !== null }));
}

/** normalised term -> first matching existing entry, for batch duplicate checks. */
export async function findExistingNormalized(db: SqlDb, normalized: string[]): Promise<Map<string, DuplicateHit>> {
  const out = new Map<string, DuplicateHit>();
  const unique = [...new Set(normalized.filter(Boolean))];
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const part = unique.slice(i, i + CHUNK);
    const rows = await db.all<{ id: string; term: string; normalized: string; meaningFa: string | null; archivedAt: string | null }>(
      `SELECT id, term, normalized_term AS normalized, meaning_fa AS meaningFa, archived_at AS archivedAt
         FROM vocabulary WHERE normalized_term IN (${part.map(() => '?').join(',')}) ORDER BY created_at`,
      part,
    );
    for (const r of rows) {
      if (!out.has(r.normalized)) out.set(r.normalized, { id: r.id, term: r.term, meaningFa: r.meaningFa, archived: r.archivedAt !== null });
    }
  }
  return out;
}

export async function boxCounts(db: SqlDb): Promise<Record<BoxNumber, number>> {
  const rows = await db.all<{ box: number; n: number }>(
    `SELECT s.box_number AS box, COUNT(*) AS n FROM review_state s
       JOIN vocabulary v ON v.id = s.vocabulary_id WHERE v.archived_at IS NULL GROUP BY s.box_number`,
  );
  const out: Record<BoxNumber, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) out[r.box as BoxNumber] = r.n;
  return out;
}

/** New unique entries created inside [fromIso, toIso). */
export async function countCreatedBetween(db: SqlDb, fromIso: string, toIso: string): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM vocabulary WHERE created_at >= ? AND created_at < ?', [fromIso, toIso]);
  return r?.n ?? 0;
}

export async function countVocabulary(db: SqlDb): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM vocabulary WHERE archived_at IS NULL');
  return r?.n ?? 0;
}

export { attachChildren, ENTRY_COLUMNS, STATE_COLUMNS };
export type { EntryRow, StateRow };

/** Active (non-archived) cards with their state, newest first. Used to build practice. */
export async function getActiveVocabulary(db: SqlDb, limit = 400): Promise<VocabularyWithState[]> {
  const rows = await db.all<EntryRow & StateRow>(
    `SELECT ${ENTRY_COLUMNS}, ${STATE_COLUMNS} FROM vocabulary v JOIN review_state s ON s.vocabulary_id = v.id
      WHERE v.archived_at IS NULL ORDER BY v.created_at DESC LIMIT ?`,
    [limit],
  );
  const entries = await attachChildren(db, rows);
  return rows.map((r, i) => ({ entry: entries[i], state: toReviewState(r) }));
}
