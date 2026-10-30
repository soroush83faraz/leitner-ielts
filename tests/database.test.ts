import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { runMigrations, LATEST_VERSION } from '@/database/migrations';
import { exportBackup, importBackup, clearAllData } from '@/database/repositories/backupRepo';
import { loadPreferences, savePreferences } from '@/database/repositories/preferencesRepo';
import { completePractice, completedCountsBySkill, createPractice } from '@/database/repositories/practiceRepo';
import { countDue, getDueQueue, recordReview, reviewTotalsBetween } from '@/database/repositories/reviewRepo';
import {
  boxCounts,
  countCreatedBetween,
  createManyVocabulary,
  createVocabulary,
  deleteVocabulary,
  findByNormalizedTerm,
  getVocabulary,
  listVocabulary,
  setArchived,
  updateVocabulary,
} from '@/database/repositories/vocabularyRepo';
import type { SqlDb } from '@/database/types';
import { parseBackupText } from '@/features/backup/schema';

import { NodeSqlDb, freshDb } from './helpers/nodeSqliteDb';

const T0 = '2026-03-01T08:00:00.000Z';
const policy = { timeZone: 'UTC' };

async function add(db: SqlDb, term: string, extra: Record<string, unknown> = {}, at = T0) {
  return createVocabulary(db, { term, meaningFa: 'معنی', ...extra }, at);
}

describe('creation', () => {
  it('creates the card and a box-1 review state together, due immediately', async () => {
    const db = await freshDb();
    const id = await add(db, 'ubiquitous', {
      examples: [{ sentence: 'Phones are ubiquitous.', translationFa: 'تلفن‌ها همه‌جا هستند.' }],
      collocations: ['ubiquitous technology'],
      wordFamily: [{ word: 'ubiquity', partOfSpeech: 'noun' }],
    });
    const got = await getVocabulary(db, id);
    expect(got?.state).toMatchObject({ boxNumber: 1, reviewCount: 0, lastReviewedAt: null, nextReviewAt: T0 });
    expect(got?.entry.examples).toHaveLength(1);
    expect(got?.entry.collocations).toEqual(['ubiquitous technology']);
    expect(got?.entry.wordFamily[0].word).toBe('ubiquity');
    expect(await countDue(db, T0)).toEqual({ reviews: 0, fresh: 1, total: 1 });
  });

  it('rejects a blank term and writes nothing', async () => {
    const db = await freshDb();
    await expect(createVocabulary(db, { term: '   ' }, T0)).rejects.toThrow();
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(0);
  });

  it('batch create is all-or-nothing', async () => {
    const db = await freshDb();
    await expect(createManyVocabulary(db, [{ term: 'ok' }, { term: '' }], T0)).rejects.toThrow();
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(0);
  });

  it('stores Persian with Persian yeh/kaf even if typed with Arabic letters', async () => {
    const db = await freshDb();
    const id = await add(db, 'book', { meaningFa: 'كتاب ي' });
    expect((await getVocabulary(db, id))?.entry.meaningFa).toBe('کتاب ی');
  });
});

describe('duplicates', () => {
  it('finds entries by normalised term, case/space/quote-insensitively, without merging', async () => {
    const db = await freshDb();
    const a = await add(db, 'Take  off');
    const b = await add(db, 'take off'); // explicit second sense is allowed at the repo level
    const hits = await findByNormalizedTerm(db, '  TAKE off ');
    expect(hits.map((h) => h.id).sort()).toEqual([a, b].sort());
    expect(await findByNormalizedTerm(db, 'take on')).toHaveLength(0);
  });

  it('can exclude the entry being edited', async () => {
    const db = await freshDb();
    const a = await add(db, 'alpha');
    expect(await findByNormalizedTerm(db, 'alpha', a)).toHaveLength(0);
  });
});

describe('review recording', () => {
  it('moves the box, logs the review and schedules from the review time', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    const res = await recordReview(db, { submissionId: 's1', vocabularyId: id, result: 'correct', reviewedAt: '2026-03-01T10:00:00.000Z', policy });
    expect(res.status).toBe('recorded');
    const got = await getVocabulary(db, id);
    expect(got?.state).toMatchObject({ boxNumber: 2, reviewCount: 1, correctCount: 1, nextReviewAt: '2026-03-02T00:00:00.000Z' });
    const log = await db.all<{ box_before: number; box_after: number; result: string }>('SELECT * FROM review_log');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ box_before: 1, box_after: 2, result: 'correct' });
  });

  it('double submission with the same id does not duplicate the log or double-advance', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    const input = { submissionId: 'same', vocabularyId: id, result: 'correct' as const, reviewedAt: '2026-03-01T10:00:00.000Z', policy };
    const [a, b] = await Promise.all([recordReview(db, input), recordReview(db, input)]);
    expect([a.status, b.status].sort()).toEqual(['duplicate', 'recorded']);
    expect((await db.all('SELECT * FROM review_log')).length).toBe(1);
    expect((await getVocabulary(db, id))?.state.boxNumber).toBe(2);
  });

  it('a stale view (card already reviewed elsewhere) is refused', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    await recordReview(db, { submissionId: 'a', vocabularyId: id, result: 'correct', reviewedAt: '2026-03-01T10:00:00.000Z', policy });
    const res = await recordReview(db, { submissionId: 'b', vocabularyId: id, result: 'correct', reviewedAt: '2026-03-01T10:01:00.000Z', expectedReviewCount: 0, policy });
    expect(res.status).toBe('stale');
    expect((await getVocabulary(db, id))?.state.boxNumber).toBe(2);
  });

  it('is atomic: if the log insert fails, the state is not changed', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    const failing: SqlDb = {
      run: (sql, p) => (sql.includes('INSERT INTO review_log') ? Promise.reject(new Error('disk full')) : db.run(sql, p)),
      all: (s, p) => db.all(s, p),
      get: (s, p) => db.get(s, p),
      exec: (s) => db.exec(s),
      transaction: (fn) => db.transaction(() => fn(failing)),
    };
    await expect(recordReview(failing, { submissionId: 'x', vocabularyId: id, result: 'correct', reviewedAt: '2026-03-01T10:00:00.000Z', policy })).rejects.toThrow('disk full');
    const got = await getVocabulary(db, id);
    expect(got?.state).toMatchObject({ boxNumber: 1, reviewCount: 0, lastReviewedAt: null });
  });

  it('an incorrect answer returns a high-box card to box 1', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    for (const [i, r] of (['correct', 'correct', 'correct'] as const).entries()) {
      await recordReview(db, { submissionId: `c${i}`, vocabularyId: id, result: r, reviewedAt: `2026-03-0${i + 1}T10:00:00.000Z`, policy });
    }
    expect((await getVocabulary(db, id))?.state.boxNumber).toBe(4);
    await recordReview(db, { submissionId: 'bad', vocabularyId: id, result: 'incorrect', reviewedAt: '2026-03-10T10:00:00.000Z', policy });
    expect((await getVocabulary(db, id))?.state).toMatchObject({ boxNumber: 1, incorrectCount: 1 });
  });

  it('due queue puts reviews before new cards, most overdue first, and skips archived', async () => {
    const db = await freshDb();
    const fresh = await add(db, 'fresh');
    const a = await add(db, 'older');
    const b = await add(db, 'newer');
    const archived = await add(db, 'gone');
    await recordReview(db, { submissionId: '1', vocabularyId: a, result: 'incorrect', reviewedAt: '2026-03-01T09:00:00.000Z', policy });
    await recordReview(db, { submissionId: '2', vocabularyId: b, result: 'incorrect', reviewedAt: '2026-03-03T09:00:00.000Z', policy });
    await setArchived(db, archived, true, T0);
    const queue = await getDueQueue(db, '2026-03-10T09:00:00.000Z');
    expect(queue.map((q) => q.entry.id)).toEqual([a, b, fresh]);
    expect(await countDue(db, '2026-03-10T09:00:00.000Z')).toEqual({ reviews: 2, fresh: 1, total: 3 });
  });

  it('keeps overdue cards in the queue indefinitely', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    await recordReview(db, { submissionId: 'a', vocabularyId: id, result: 'correct', reviewedAt: T0, policy });
    const queue = await getDueQueue(db, '2027-03-01T00:00:00.000Z');
    expect(queue.map((q) => q.entry.id)).toEqual([id]);
  });

  it('totals count reviews inside the requested window only', async () => {
    const db = await freshDb();
    const id = await add(db, 'x');
    await recordReview(db, { submissionId: '1', vocabularyId: id, result: 'correct', reviewedAt: '2026-03-01T10:00:00.000Z', policy });
    await recordReview(db, { submissionId: '2', vocabularyId: id, result: 'incorrect', reviewedAt: '2026-03-05T10:00:00.000Z', policy });
    expect(await reviewTotalsBetween(db, '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z')).toEqual({ correct: 1, incorrect: 0 });
  });
});

describe('editing, archiving and deleting', () => {
  it('editing content does not touch review state or history', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    await recordReview(db, { submissionId: 'a', vocabularyId: id, result: 'correct', reviewedAt: T0, policy });
    const before = (await getVocabulary(db, id))!.state;
    await updateVocabulary(db, id, { term: 'resilient', meaningFa: 'مقاوم', examples: [{ sentence: 'She is resilient.' }] }, '2026-03-02T00:00:00.000Z');
    const after = await getVocabulary(db, id);
    expect(after?.state).toEqual(before);
    expect(after?.entry.meaningFa).toBe('مقاوم');
    expect(after?.entry.examples).toHaveLength(1);
    expect(await db.all('SELECT 1 FROM review_log')).toHaveLength(1);
  });

  it('archive hides from the default list and from the queue; unarchive restores', async () => {
    const db = await freshDb();
    const id = await add(db, 'resilient');
    await setArchived(db, id, true, T0);
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(0);
    expect(await listVocabulary(db, { nowIso: T0, status: 'archived' })).toHaveLength(1);
    await setArchived(db, id, false, T0);
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(1);
  });

  it('permanent delete keeps other cards and the deleted card’s history (detached)', async () => {
    const db = await freshDb();
    const keep = await add(db, 'keep');
    const gone = await add(db, 'gone', { examples: [{ sentence: 'x' }] });
    await recordReview(db, { submissionId: 'k', vocabularyId: keep, result: 'correct', reviewedAt: T0, policy });
    await recordReview(db, { submissionId: 'g', vocabularyId: gone, result: 'correct', reviewedAt: T0, policy });
    await deleteVocabulary(db, gone);
    expect(await getVocabulary(db, gone)).toBeNull();
    expect((await getVocabulary(db, keep))?.state.reviewCount).toBe(1);
    expect(await db.all('SELECT * FROM review_log')).toHaveLength(2);
    expect(await db.all('SELECT * FROM vocabulary_example')).toHaveLength(0);
    expect(await reviewTotalsBetween(db, '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toEqual({ correct: 2, incorrect: 0 });
  });
});

describe('listing and counting', () => {
  it('filters by search (term, meaning), box, topic, type and status; escapes LIKE wildcards', async () => {
    const db = await freshDb();
    await add(db, 'mitigate', { meaningFa: 'کاهش دادن', topic: 'Environment' });
    await add(db, 'hundred%', { meaningFa: 'صد درصد' });
    await add(db, 'carry out', { entryType: 'phrase', meaningFa: null });
    const q = (f: object) => listVocabulary(db, { nowIso: T0, ...f }).then((r) => r.map((x) => x.term).sort());
    expect(await q({ search: 'mitig' })).toEqual(['mitigate']);
    expect(await q({ search: 'کاهش' })).toEqual(['mitigate']);
    expect(await q({ search: '%' })).toEqual(['hundred%']);
    expect(await q({ topic: 'Environment' })).toEqual(['mitigate']);
    expect(await q({ entryType: 'phrase' })).toEqual(['carry out']);
    expect(await q({ status: 'incomplete' })).toEqual(['carry out']);
    expect(await q({ status: 'new' })).toHaveLength(3);
    expect(await q({ box: 2 })).toEqual([]);
  });

  it('counts per box and new entries created inside a window', async () => {
    const db = await freshDb();
    const a = await add(db, 'a', {}, '2026-03-01T08:00:00.000Z');
    await add(db, 'b', {}, '2026-03-02T08:00:00.000Z');
    await recordReview(db, { submissionId: '1', vocabularyId: a, result: 'correct', reviewedAt: '2026-03-02T09:00:00.000Z', policy });
    expect(await boxCounts(db)).toEqual({ 1: 1, 2: 1, 3: 0, 4: 0, 5: 0 });
    expect(await countCreatedBetween(db, '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z')).toBe(1);
  });
});

describe('persistence', () => {
  it('data survives closing and reopening the database file (app restart)', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'leitner-')), 'app.db');
    const first = new NodeSqlDb(new DatabaseSync(file));
    await runMigrations(first);
    const id = await add(first, 'persistent');
    await recordReview(first, { submissionId: 'r', vocabularyId: id, result: 'correct', reviewedAt: T0, policy });
    await savePreferences(first, { dailyNewTarget: 15 });
    first.raw.close();

    const second = new NodeSqlDb(new DatabaseSync(file));
    expect(await runMigrations(second)).toBe(LATEST_VERSION); // idempotent
    expect((await getVocabulary(second, id))?.state.boxNumber).toBe(2);
    expect((await loadPreferences(second)).dailyNewTarget).toBe(15);
    second.raw.close();
  });
});

describe('preferences', () => {
  it('default daily target is 10 and it is configurable and validated', async () => {
    const db = await freshDb();
    expect((await loadPreferences(db)).dailyNewTarget).toBe(10);
    await savePreferences(db, { dailyNewTarget: 20 });
    expect((await loadPreferences(db)).dailyNewTarget).toBe(20);
    await expect(savePreferences(db, { dailyNewTarget: 0 })).rejects.toThrow();
    expect((await loadPreferences(db)).dailyNewTarget).toBe(20);
  });

  it('a corrupt stored value falls back to default without discarding the rest', async () => {
    const db = await freshDb();
    await savePreferences(db, { theme: 'dark' });
    await db.run("UPDATE user_preference SET value = '999' WHERE key = 'dailyNewTarget'");
    const p = await loadPreferences(db);
    expect(p.dailyNewTarget).toBe(10);
    expect(p.theme).toBe('dark');
  });
});

describe('backup', () => {
  async function populated() {
    const db = await freshDb();
    const a = await add(db, 'alpha', { examples: [{ sentence: 'Alpha one.' }] });
    await add(db, 'beta');
    await recordReview(db, { submissionId: 'r1', vocabularyId: a, result: 'correct', reviewedAt: T0, policy });
    await createPractice(db, { id: 'p1', skill: 'writing', activityType: 'sentence', targetVocabularyIds: [a], prompt: 'Write', createdAt: T0 });
    await completePractice(db, 'p1', { userResponse: 'Alpha is first.', completedAt: T0 });
    await savePreferences(db, { dailyNewTarget: 12 });
    return { db, a };
  }

  it('round-trips through JSON into an empty database', async () => {
    const { db } = await populated();
    const exported = await exportBackup(db, T0);
    const parsed = parseBackupText(JSON.stringify(exported));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = await freshDb();
    const report = await importBackup(target, parsed.backup, { applyPreferences: true });
    expect(report).toMatchObject({ vocabularyAdded: 2, reviewLogsAdded: 1, practiceAdded: 1, preferencesApplied: true });
    expect((await loadPreferences(target)).dailyNewTarget).toBe(12);
    const again = await exportBackup(target, T0);
    expect(again.data.vocabulary.map((v) => v.term)).toEqual(['alpha', 'beta']);
    expect(again.data.reviewStates.find((s) => s.boxNumber === 2)).toBeTruthy();
    expect(await completedCountsBySkill(target)).toMatchObject({ writing: 1 });
  });

  it('importing twice does not duplicate anything', async () => {
    const { db } = await populated();
    const parsed = parseBackupText(JSON.stringify(await exportBackup(db, T0)));
    if (!parsed.ok) throw new Error('parse');
    const report = await importBackup(db, parsed.backup, { applyPreferences: false });
    expect(report).toMatchObject({ vocabularyAdded: 0, skippedSameId: 2, reviewLogsAdded: 0, practiceAdded: 0 });
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(2);
  });

  it('skips cards whose term already exists under another id, with a count, and keeps local data', async () => {
    const { db } = await populated();
    const parsed = parseBackupText(JSON.stringify(await exportBackup(db, T0)));
    if (!parsed.ok) throw new Error('parse');
    const other = await freshDb();
    const localId = await add(other, 'Alpha', { meaningFa: 'محلی' });
    const report = await importBackup(other, parsed.backup, { applyPreferences: false });
    expect(report.skippedDuplicateTerm).toBe(1);
    expect(report.vocabularyAdded).toBe(1);
    expect((await getVocabulary(other, localId))?.entry.meaningFa).toBe('محلی');
    expect((await db.all('SELECT 1 FROM review_log')).length).toBe(1);
    expect((await other.all('SELECT 1 FROM review_log')).length).toBe(0); // alpha's history not attached to local alpha
  });

  it('rejects malformed JSON, foreign files and invalid structures without touching the database', async () => {
    const { db } = await populated();
    const before = await exportBackup(db, T0);
    expect(parseBackupText('{not json')).toMatchObject({ ok: false, reason: 'not_json' });
    expect(parseBackupText('{"hello":1}')).toMatchObject({ ok: false, reason: 'wrong_format' });
    const bad = JSON.parse(JSON.stringify(before));
    bad.data.reviewStates[0].boxNumber = 9;
    expect(parseBackupText(JSON.stringify(bad))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await exportBackup(db, T0)).toEqual(before);
  });

  it('a failure during import rolls everything back', async () => {
    const { db } = await populated();
    const parsed = parseBackupText(JSON.stringify(await exportBackup(db, T0)));
    if (!parsed.ok) throw new Error('parse');
    const target = await freshDb();
    parsed.backup.data.vocabulary[1].createdAt = 'x'.repeat(5); // survives schema, fine for SQLite
    const failing: SqlDb = {
      run: (sql, p) => (sql.includes('INTO practice_session') ? Promise.reject(new Error('boom')) : target.run(sql, p)),
      all: (s, p) => target.all(s, p),
      get: (s, p) => target.get(s, p),
      exec: (s) => target.exec(s),
      transaction: (fn) => target.transaction(() => fn(failing)),
    };
    await expect(importBackup(failing, parsed.backup, { applyPreferences: true })).rejects.toThrow('boom');
    expect(await listVocabulary(target, { nowIso: T0 })).toHaveLength(0);
    expect(await target.all('SELECT 1 FROM review_log')).toHaveLength(0);
  });

  it('clearAllData empties every table but keeps the schema usable', async () => {
    const { db } = await populated();
    await clearAllData(db);
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(0);
    expect(await db.all('SELECT 1 FROM review_log')).toHaveLength(0);
    await add(db, 'after');
    expect(await listVocabulary(db, { nowIso: T0 })).toHaveLength(1);
  });
});
