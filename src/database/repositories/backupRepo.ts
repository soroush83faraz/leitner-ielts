import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
} from '@/features/backup/schema';
import { preferencesSchema } from '@/features/settings/preferences';
import { normalizeTerm } from '@/utils/text';

import type { SqlDb } from '../types';
import { loadPreferences } from './preferencesRepo';
import { attachChildren, ENTRY_COLUMNS, STATE_COLUMNS, toReviewState, type EntryRow, type StateRow } from './vocabularyRepo';
import { listPractice } from './practiceRepo';

export async function exportBackup(db: SqlDb, nowIso: string): Promise<BackupFile> {
  const rows = await db.all<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM vocabulary v ORDER BY v.created_at, v.rowid`);
  const vocabulary = await attachChildren(db, rows);
  const states = await db.all<StateRow>(`SELECT ${STATE_COLUMNS} FROM review_state s`);
  const logs = await db.all<{
    id: string; vocabularyId: string | null; reviewedAt: string; result: 'correct' | 'incorrect';
    boxBefore: number; boxAfter: number; scheduledAtBefore: string | null; sessionId: string | null;
  }>(
    `SELECT id, vocabulary_id AS vocabularyId, reviewed_at AS reviewedAt, result, box_before AS boxBefore,
            box_after AS boxAfter, scheduled_at_before AS scheduledAtBefore, session_id AS sessionId
       FROM review_log ORDER BY reviewed_at`,
  );
  const practice = await listPractice(db, { limit: 100000 });
  const prefs = await loadPreferences(db);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso,
    data: {
      vocabulary: vocabulary.map((v) => ({
        id: v.id, term: v.term, meaningFa: v.meaningFa, definitionEn: v.definitionEn, partOfSpeech: v.partOfSpeech,
        ipa: v.ipa, examples: v.examples, collocations: v.collocations, wordFamily: v.wordFamily, topic: v.topic,
        entryType: v.entryType, sourceSentence: v.sourceSentence, sourceType: v.sourceType,
        createdAt: v.createdAt, updatedAt: v.updatedAt, archivedAt: v.archivedAt,
      })),
      reviewStates: states.map((s) => {
        const r = toReviewState(s);
        return { vocabularyId: r.vocabularyId, boxNumber: r.boxNumber, nextReviewAt: r.nextReviewAt, lastReviewedAt: r.lastReviewedAt,
          correctCount: r.correctCount, incorrectCount: r.incorrectCount, reviewCount: r.reviewCount, createdAt: r.createdAt, updatedAt: r.updatedAt };
      }),
      reviewLogs: logs,
      practiceSessions: practice.map((p) => ({
        id: p.id, skill: p.skill, activityType: p.activityType, targetVocabularyIds: p.targetVocabularyIds, prompt: p.prompt,
        payload: p.payload ?? null, userResponse: p.userResponse, feedback: p.feedback ?? null, scoreCorrect: p.scoreCorrect,
        scoreTotal: p.scoreTotal, status: p.status, createdAt: p.createdAt, completedAt: p.completedAt,
      })),
      preferences: prefs,
    },
  };
}

export interface ImportReport {
  vocabularyAdded: number;
  skippedSameId: number;
  skippedDuplicateTerm: number;
  reviewLogsAdded: number;
  practiceAdded: number;
  preferencesApplied: boolean;
}

/**
 * Merge-import in one transaction: any failure rolls back, leaving existing data untouched.
 * Existing cards are never overwritten or merged; a card whose normalised term already
 * exists is skipped (with its state and history) and counted in the report.
 */
export async function importBackup(
  db: SqlDb,
  backup: BackupFile,
  opts: { applyPreferences: boolean },
): Promise<ImportReport> {
  return db.transaction(async (tx) => {
    const report: ImportReport = {
      vocabularyAdded: 0, skippedSameId: 0, skippedDuplicateTerm: 0, reviewLogsAdded: 0, practiceAdded: 0, preferencesApplied: false,
    };
    const existing = await tx.all<{ id: string; normalized: string }>('SELECT id, normalized_term AS normalized FROM vocabulary');
    const ids = new Set(existing.map((e) => e.id));
    const terms = new Set(existing.map((e) => e.normalized));
    const imported = new Set<string>();
    const stateById = new Map(backup.data.reviewStates.map((s) => [s.vocabularyId, s]));

    for (const v of backup.data.vocabulary) {
      const norm = normalizeTerm(v.term);
      if (ids.has(v.id)) { report.skippedSameId += 1; continue; }
      if (terms.has(norm)) { report.skippedDuplicateTerm += 1; continue; }
      await tx.run(
        `INSERT INTO vocabulary (id, term, normalized_term, meaning_fa, definition_en, part_of_speech, ipa, topic,
           entry_type, source_sentence, source_type, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [v.id, v.term, norm, v.meaningFa, v.definitionEn, v.partOfSpeech, v.ipa, v.topic, v.entryType, v.sourceSentence, v.sourceType, v.createdAt, v.updatedAt, v.archivedAt],
      );
      for (const [i, e] of v.examples.entries()) await tx.run('INSERT INTO vocabulary_example (vocabulary_id, position, sentence, translation_fa) VALUES (?,?,?,?)', [v.id, i, e.sentence, e.translationFa]);
      for (const [i, c] of v.collocations.entries()) await tx.run('INSERT INTO vocabulary_collocation (vocabulary_id, position, text) VALUES (?,?,?)', [v.id, i, c]);
      for (const [i, w] of v.wordFamily.entries()) await tx.run('INSERT INTO vocabulary_word_family (vocabulary_id, position, word, part_of_speech) VALUES (?,?,?,?)', [v.id, i, w.word, w.partOfSpeech]);
      const s = stateById.get(v.id);
      await tx.run(
        `INSERT INTO review_state (vocabulary_id, box_number, next_review_at, last_reviewed_at, correct_count, incorrect_count,
           review_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        s
          ? [v.id, s.boxNumber, s.nextReviewAt, s.lastReviewedAt, s.correctCount, s.incorrectCount, s.reviewCount, s.createdAt, s.updatedAt]
          : [v.id, 1, v.createdAt, null, 0, 0, 0, v.createdAt, v.updatedAt],
      );
      ids.add(v.id);
      terms.add(norm);
      imported.add(v.id);
      report.vocabularyAdded += 1;
    }

    for (const l of backup.data.reviewLogs) {
      // Logs of cards we skipped belong to the card that already exists locally; don't duplicate history.
      if (l.vocabularyId !== null && !imported.has(l.vocabularyId)) continue;
      const res = await tx.run(
        `INSERT OR IGNORE INTO review_log (id, vocabulary_id, reviewed_at, result, box_before, box_after, scheduled_at_before, session_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [l.id, l.vocabularyId, l.reviewedAt, l.result, l.boxBefore, l.boxAfter, l.scheduledAtBefore, l.sessionId],
      );
      report.reviewLogsAdded += res.changes;
    }

    for (const p of backup.data.practiceSessions) {
      const res = await tx.run(
        `INSERT OR IGNORE INTO practice_session (id, skill, activity_type, target_vocabulary_ids, prompt, payload, user_response,
           feedback, score_correct, score_total, status, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.skill, p.activityType, JSON.stringify(p.targetVocabularyIds), p.prompt, p.payload == null ? null : JSON.stringify(p.payload),
          p.userResponse, p.feedback == null ? null : JSON.stringify(p.feedback), p.scoreCorrect, p.scoreTotal, p.status, p.createdAt, p.completedAt],
      );
      report.practiceAdded += res.changes;
    }

    if (opts.applyPreferences) {
      const parsed = preferencesSchema.partial().safeParse(backup.data.preferences);
      if (parsed.success) {
        for (const [k, val] of Object.entries(parsed.data)) {
          if (val === undefined) continue;
          await tx.run('INSERT INTO user_preference (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, JSON.stringify(val)]);
        }
        report.preferencesApplied = true;
      }
    }
    return report;
  });
}

/** Wipes every user table in one transaction (schema stays). */
export async function clearAllData(db: SqlDb): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of ['review_log', 'practice_session', 'review_state', 'vocabulary_example', 'vocabulary_collocation', 'vocabulary_word_family', 'vocabulary', 'user_preference']) {
      await tx.run(`DELETE FROM ${t}`);
    }
  });
}
