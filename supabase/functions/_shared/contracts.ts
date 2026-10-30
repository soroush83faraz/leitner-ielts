/**
 * Request/response contracts for the four AI operations.
 *
 * Single source of truth: imported by the Edge Functions (Deno resolves `zod`
 * through supabase/functions/deno.json) AND by the mobile client. Keep this
 * file free of relative imports and runtime-specific APIs.
 */
import { z } from 'zod';

export const LIMITS = {
  termMax: 80,
  contextMax: 500,
  extractTextMax: 10_000,
  extractCandidatesDefault: 20,
  extractCandidatesMax: 20,
  writingTextMax: 2_000,
  practiceTargetsMax: 5,
  cardBatchMax: 8,
} as const;

export const LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
export const TOPICS = ['Education', 'Technology', 'Environment', 'Health', 'Work', 'Society', 'Other'] as const;
export const ENTRY_TYPES = ['word', 'phrase', 'collocation'] as const;

const str = (max: number) => z.string().trim().max(max);
const optStr = (max: number) => str(max).nullish().transform((v) => (v ? v : null));

/* ---------- generate-card ---------- */

export const generateCardRequest = z.object({
  term: str(LIMITS.termMax).min(1),
  context: str(LIMITS.contextMax).optional(),
  level: z.enum(LEVELS).default('B2'),
  uiLanguage: z.literal('fa').default('fa'),
});
export type GenerateCardRequest = z.input<typeof generateCardRequest>;

export const cardSuggestion = z.object({
  term: str(LIMITS.termMax).min(1),
  meaningFa: str(300).min(1),
  definitionEn: optStr(400),
  partOfSpeech: optStr(30),
  ipa: optStr(80),
  examples: z
    .array(z.object({ sentence: str(300).min(1), translationFa: optStr(300) }))
    .max(3)
    .default([]),
  collocations: z.array(str(80).min(1)).max(6).default([]),
  wordFamily: z
    .array(z.object({ word: str(60).min(1), partOfSpeech: optStr(30) }))
    .max(6)
    .default([]),
  topic: z.enum(TOPICS).nullish().transform((v) => v ?? null),
  entryType: z.enum(ENTRY_TYPES).default('word'),
});
export type CardSuggestion = z.output<typeof cardSuggestion>;

export const generateCardResponse = z.object({ card: cardSuggestion });
export type GenerateCardResponse = z.output<typeof generateCardResponse>;

/** Batch variant used by bulk import: per-item isolation is done by the server. */
export const generateCardsRequest = z.object({
  items: z
    .array(z.object({ term: str(LIMITS.termMax).min(1), meaningFa: str(300).optional() }))
    .min(1)
    .max(LIMITS.cardBatchMax),
  level: z.enum(LEVELS).default('B2'),
  uiLanguage: z.literal('fa').default('fa'),
});
export type GenerateCardsRequest = z.input<typeof generateCardsRequest>;

export const generateCardsResponse = z.object({
  results: z.array(
    z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), term: z.string(), card: cardSuggestion }),
      z.object({ ok: z.literal(false), term: z.string(), error: z.string() }),
    ]),
  ),
});
export type GenerateCardsResponse = z.output<typeof generateCardsResponse>;

/* ---------- extract-vocabulary ---------- */

export const extractRequest = z.object({
  text: str(LIMITS.extractTextMax).min(20, 'text_too_short'),
  level: z.enum(LEVELS).default('B2'),
  topic: z.enum(TOPICS).optional(),
  maxCandidates: z.number().int().min(1).max(LIMITS.extractCandidatesMax).default(LIMITS.extractCandidatesDefault),
  uiLanguage: z.literal('fa').default('fa'),
});
export type ExtractRequest = z.input<typeof extractRequest>;

/** What the model must produce. */
export const modelCandidate = z.object({
  term: str(LIMITS.termMax).min(1),
  entryType: z.enum(ENTRY_TYPES).default('word'),
  meaningInContext: str(300).min(1),
  sourceSentence: str(500).min(1),
  difficulty: z.enum(LEVELS).nullish().transform((v) => v ?? null),
  topic: z.enum(TOPICS).nullish().transform((v) => v ?? null),
});
export const modelExtraction = z.object({ candidates: z.array(modelCandidate).max(60) });

/** What the client receives: the server adds the verification result. */
export const extractedCandidate = modelCandidate.extend({
  sourceSentence: z.string().nullable(),
  sourceVerified: z.boolean(),
});
export type ExtractedCandidate = z.output<typeof extractedCandidate>;

export const extractResponse = z.object({ candidates: z.array(extractedCandidate).max(LIMITS.extractCandidatesMax) });
export type ExtractResponse = z.output<typeof extractResponse>;

/* ---------- generate-practice ---------- */

export const practiceTarget = z.object({
  term: str(LIMITS.termMax).min(1),
  meaningFa: str(300).optional(),
  context: str(LIMITS.contextMax).optional(),
});

export const generatePracticeRequest = z.object({
  skill: z.enum(['reading', 'writing', 'speaking']),
  targets: z.array(practiceTarget).min(1).max(LIMITS.practiceTargetsMax),
  level: z.enum(LEVELS).default('B2'),
  uiLanguage: z.literal('fa').default('fa'),
});
export type GeneratePracticeRequest = z.input<typeof generatePracticeRequest>;

export const readingTask = z.object({
  skill: z.literal('reading'),
  passage: str(1200).min(40),
  questions: z
    .array(
      z.object({
        kind: z.enum(['meaning_in_context', 'paraphrase']),
        question: str(300).min(1),
        options: z.array(str(200).min(1)).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanationFa: str(400).min(1),
        targetTerm: str(LIMITS.termMax).optional(),
      }),
    )
    .min(1)
    .max(5),
});

export const writingTask = z.object({
  skill: z.literal('writing'),
  prompt: str(500).min(1),
  hintFa: optStr(300),
});

export const speakingTask = z.object({
  skill: z.literal('speaking'),
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: str(500).min(1),
  cuePoints: z.array(str(150)).max(5).default([]),
});

export const practiceTask = z.discriminatedUnion('skill', [readingTask, writingTask, speakingTask]);
export type PracticeTask = z.output<typeof practiceTask>;
export const generatePracticeResponse = z.object({ task: practiceTask });
export type GeneratePracticeResponse = z.output<typeof generatePracticeResponse>;

/* ---------- evaluate-writing ---------- */

export const evaluateRequest = z.object({
  text: str(LIMITS.writingTextMax).min(3),
  targets: z.array(z.object({ term: str(LIMITS.termMax).min(1), meaningFa: str(300).optional() })).max(LIMITS.practiceTargetsMax),
  prompt: str(600).optional(),
  mode: z.enum(['writing', 'speaking']).default('writing'),
  uiLanguage: z.literal('fa').default('fa'),
});
export type EvaluateRequest = z.input<typeof evaluateRequest>;

export const ISSUE_TYPES = ['grammar', 'collocation', 'meaning', 'naturalness', 'spelling', 'vocabulary'] as const;

export const evaluation = z.object({
  correctedText: str(LIMITS.writingTextMax * 2),
  issues: z
    .array(
      z.object({
        original: str(300),
        suggestion: str(300),
        type: z.enum(ISSUE_TYPES),
        explanationFa: str(500).min(1),
      }),
    )
    .max(12),
  vocabularyUse: z
    .array(
      z.object({
        term: str(LIMITS.termMax).min(1),
        used: z.boolean(),
        correctness: z.enum(['correct', 'incorrect', 'uncertain']).nullable(),
        reasonFa: str(400).min(1),
      }),
    )
    .max(LIMITS.practiceTargetsMax),
  followUpFa: str(400).min(1),
});
export type Evaluation = z.output<typeof evaluation>;
export const evaluateResponse = z.object({ evaluation });
export type EvaluateResponse = z.output<typeof evaluateResponse>;

/* ---------- errors ---------- */

export const AI_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'rate_limited',
  'too_large',
  'provider_error',
  'invalid_response',
  'timeout',
  'not_configured',
  'offline',
  'server_error',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const errorBody = z.object({
  error: z.object({
    code: z.enum(AI_ERROR_CODES),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
  }),
});
