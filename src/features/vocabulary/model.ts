import { z } from 'zod';

import { MAX_TERM_LENGTH } from '@/utils/text';
import type { ReviewState } from '@/features/leitner/algorithm';

export const ENTRY_TYPES = ['word', 'phrase', 'collocation'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const SOURCE_TYPES = ['manual', 'bulk', 'text'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const TOPICS = ['Education', 'Technology', 'Environment', 'Health', 'Work', 'Society', 'Other'] as const;
export type Topic = (typeof TOPICS)[number];

/** Extensible: unknown values from AI/backup are accepted as free text. */
export const COMMON_PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'phrasal verb',
  'idiom',
] as const;

export const ENTRY_TYPE_FA: Record<EntryType, string> = {
  word: 'واژه',
  phrase: 'عبارت',
  collocation: 'هم‌نشینی',
};

export const TOPIC_FA: Record<Topic, string> = {
  Education: 'آموزش',
  Technology: 'فناوری',
  Environment: 'محیط زیست',
  Health: 'سلامت',
  Work: 'کار',
  Society: 'جامعه',
  Other: 'سایر',
};

export const SOURCE_TYPE_FA: Record<SourceType, string> = {
  manual: 'دستی',
  bulk: 'فهرست',
  text: 'استخراج از متن',
};

const text = (max: number) => z.string().trim().max(max);

export const exampleSchema = z.object({
  sentence: text(300).min(1),
  translationFa: text(300).nullish().transform((v) => v || null),
});
export type Example = z.infer<typeof exampleSchema>;

export const wordFamilySchema = z.object({
  word: text(60).min(1),
  partOfSpeech: text(30).nullish().transform((v) => v || null),
});
export type WordFamilyItem = z.infer<typeof wordFamilySchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Fields a user (or an AI suggestion, after review) can supply for a card. */
export const vocabularyInputSchema = z.object({
  term: text(MAX_TERM_LENGTH).min(1, 'term_required'),
  meaningFa: optionalText(300),
  definitionEn: optionalText(400),
  partOfSpeech: optionalText(30),
  ipa: optionalText(80),
  examples: z.array(exampleSchema).max(5).default([]),
  collocations: z.array(text(80).min(1)).max(10).default([]),
  wordFamily: z.array(wordFamilySchema).max(10).default([]),
  topic: z.enum(TOPICS).nullish().transform((v) => v ?? null),
  entryType: z.enum(ENTRY_TYPES).default('word'),
  sourceSentence: optionalText(500),
  sourceType: z.enum(SOURCE_TYPES).default('manual'),
});
export type VocabularyInput = z.input<typeof vocabularyInputSchema>;
export type ValidVocabularyInput = z.output<typeof vocabularyInputSchema>;

export interface VocabularyEntry {
  id: string;
  term: string;
  normalizedTerm: string;
  meaningFa: string | null;
  definitionEn: string | null;
  partOfSpeech: string | null;
  ipa: string | null;
  examples: Example[];
  collocations: string[];
  wordFamily: WordFamilyItem[];
  topic: Topic | null;
  entryType: EntryType;
  sourceSentence: string | null;
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface VocabularyWithState {
  entry: VocabularyEntry;
  state: ReviewState;
}

/** A card missing the Persian meaning is flagged as incomplete in the UI. */
export function isIncomplete(entry: Pick<VocabularyEntry, 'meaningFa'>): boolean {
  return !entry.meaningFa;
}
