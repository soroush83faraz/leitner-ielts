import { z } from 'zod';

import { ENTRY_TYPES, SOURCE_TYPES, TOPICS, exampleSchema, wordFamilySchema } from '@/features/vocabulary/model';

export const BACKUP_FORMAT = 'leitner-ielts-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 15 * 1024 * 1024;

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date');
const nullableIso = iso.nullable();
const box = z.number().int().min(1).max(5);
const count = z.number().int().min(0);

export const backupEntrySchema = z.object({
  id: z.string().min(1).max(100),
  term: z.string().trim().min(1).max(200),
  meaningFa: z.string().nullable().default(null),
  definitionEn: z.string().nullable().default(null),
  partOfSpeech: z.string().nullable().default(null),
  ipa: z.string().nullable().default(null),
  examples: z.array(exampleSchema).default([]),
  collocations: z.array(z.string()).default([]),
  wordFamily: z.array(wordFamilySchema).default([]),
  topic: z.enum(TOPICS).nullable().default(null),
  entryType: z.enum(ENTRY_TYPES).default('word'),
  sourceSentence: z.string().nullable().default(null),
  sourceType: z.enum(SOURCE_TYPES).default('manual'),
  createdAt: iso,
  updatedAt: iso,
  archivedAt: nullableIso.default(null),
});

export const backupStateSchema = z.object({
  vocabularyId: z.string().min(1),
  boxNumber: box,
  nextReviewAt: iso,
  lastReviewedAt: nullableIso,
  correctCount: count,
  incorrectCount: count,
  reviewCount: count,
  createdAt: iso,
  updatedAt: iso,
});

export const backupLogSchema = z.object({
  id: z.string().min(1),
  vocabularyId: z.string().nullable(),
  reviewedAt: iso,
  result: z.enum(['correct', 'incorrect']),
  boxBefore: box,
  boxAfter: box,
  scheduledAtBefore: nullableIso.default(null),
  sessionId: z.string().nullable().default(null),
});

export const backupPracticeSchema = z.object({
  id: z.string().min(1),
  skill: z.enum(['reading', 'listening', 'writing', 'speaking']),
  activityType: z.string().min(1),
  targetVocabularyIds: z.array(z.string()).default([]),
  prompt: z.string(),
  payload: z.unknown().nullable().default(null),
  userResponse: z.string().nullable().default(null),
  feedback: z.unknown().nullable().default(null),
  scoreCorrect: count.nullable().default(null),
  scoreTotal: count.nullable().default(null),
  status: z.enum(['in_progress', 'completed']),
  createdAt: iso,
  completedAt: nullableIso.default(null),
});

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: iso,
  data: z.object({
    vocabulary: z.array(backupEntrySchema),
    reviewStates: z.array(backupStateSchema),
    reviewLogs: z.array(backupLogSchema),
    practiceSessions: z.array(backupPracticeSchema).default([]),
    preferences: z.record(z.string(), z.unknown()).default({}),
  }),
});

export type BackupFile = z.infer<typeof backupFileSchema>;

export type BackupParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; reason: 'too_large' | 'not_json' | 'wrong_format' | 'invalid'; detail?: string };

/** Validates raw file text. Never throws; never touches the database. */
export function parseBackupText(text: string): BackupParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, reason: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  if (typeof json !== 'object' || json === null || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, reason: 'wrong_format' };
  }
  const res = backupFileSchema.safeParse(json);
  if (!res.success) {
    const first = res.error.issues[0];
    return { ok: false, reason: 'invalid', detail: `${first.path.join('.')}: ${first.message}` };
  }
  return { ok: true, backup: res.data };
}

export const BACKUP_ERROR_FA: Record<Extract<BackupParseResult, { ok: false }>['reason'], string> = {
  too_large: 'فایل بیش از حد بزرگ است.',
  not_json: 'این فایل JSON معتبر نیست.',
  wrong_format: 'این فایل، پشتیبان این برنامه نیست.',
  invalid: 'ساختار فایل پشتیبان معتبر نیست؛ هیچ داده‌ای تغییر نکرد.',
};
