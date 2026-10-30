import type { CardSuggestion } from '../../../supabase/functions/_shared/contracts';

import { squash, TERM_PROBLEM_FA, validateTerm } from '@/utils/text';

import type { EntryType, Example, SourceType, Topic, VocabularyEntry, VocabularyInput, WordFamilyItem } from './model';

/** Everything the form edits, as plain strings so partial input is never lost. */
export interface CardFormState {
  term: string;
  meaningFa: string;
  definitionEn: string;
  partOfSpeech: string;
  ipa: string;
  topic: Topic | null;
  entryType: EntryType;
  sourceSentence: string;
  examples: { sentence: string; translationFa: string }[];
  collocationsText: string;
  wordFamilyText: string;
  sourceType: SourceType;
}

export function emptyForm(init: Partial<CardFormState> = {}): CardFormState {
  return {
    term: '',
    meaningFa: '',
    definitionEn: '',
    partOfSpeech: '',
    ipa: '',
    topic: null,
    entryType: 'word',
    sourceSentence: '',
    examples: [],
    collocationsText: '',
    wordFamilyText: '',
    sourceType: 'manual',
    ...init,
  };
}

export function formFromEntry(e: VocabularyEntry): CardFormState {
  return {
    term: e.term,
    meaningFa: e.meaningFa ?? '',
    definitionEn: e.definitionEn ?? '',
    partOfSpeech: e.partOfSpeech ?? '',
    ipa: e.ipa ?? '',
    topic: e.topic,
    entryType: e.entryType,
    sourceSentence: e.sourceSentence ?? '',
    examples: e.examples.map((x) => ({ sentence: x.sentence, translationFa: x.translationFa ?? '' })),
    collocationsText: e.collocations.join('\n'),
    wordFamilyText: e.wordFamily.map((w) => (w.partOfSpeech ? `${w.word} (${w.partOfSpeech})` : w.word)).join('\n'),
    sourceType: e.sourceType,
  };
}

/** One collocation per line or comma-separated. */
export function parseCollocations(text: string): string[] {
  return [...new Set(text.split(/[\n,;،]+/).map(squash).filter(Boolean))].slice(0, 10);
}

/** Lines like `ubiquity (noun)` or `ubiquitous - adjective`. */
export function parseWordFamily(text: string): WordFamilyItem[] {
  return text
    .split('\n')
    .map(squash)
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => {
      const m = line.match(/^(.+?)\s*(?:\(([^)]+)\)|[-–:]\s*(.+))$/);
      return m ? { word: squash(m[1]), partOfSpeech: squash(m[2] ?? m[3] ?? '') || null } : { word: line, partOfSpeech: null };
    });
}

export function formToInput(f: CardFormState): VocabularyInput {
  const examples: Example[] = f.examples
    .filter((x) => squash(x.sentence))
    .map((x) => ({ sentence: squash(x.sentence), translationFa: squash(x.translationFa) || null }));
  return {
    term: squash(f.term),
    meaningFa: squash(f.meaningFa) || null,
    definitionEn: squash(f.definitionEn) || null,
    partOfSpeech: squash(f.partOfSpeech) || null,
    ipa: squash(f.ipa) || null,
    topic: f.topic,
    entryType: f.entryType,
    sourceSentence: squash(f.sourceSentence) || null,
    sourceType: f.sourceType,
    examples,
    collocations: parseCollocations(f.collocationsText),
    wordFamily: parseWordFamily(f.wordFamilyText),
  };
}

export interface FormErrors {
  term?: string;
}

export function validateForm(f: CardFormState): FormErrors {
  const p = validateTerm(f.term);
  return p ? { term: TERM_PROBLEM_FA[p] } : {};
}

/**
 * Merges an AI suggestion into the form WITHOUT overwriting anything the user
 * already typed. Returns the new state and how many fields were filled.
 */
export function applySuggestion(f: CardFormState, s: CardSuggestion): { form: CardFormState; filled: number } {
  let filled = 0;
  const pick = (cur: string, next: string | null | undefined) => {
    if (squash(cur) || !next) return cur;
    filled += 1;
    return next;
  };
  const form: CardFormState = {
    ...f,
    meaningFa: pick(f.meaningFa, s.meaningFa),
    definitionEn: pick(f.definitionEn, s.definitionEn),
    partOfSpeech: pick(f.partOfSpeech, s.partOfSpeech),
    ipa: pick(f.ipa, s.ipa),
    topic: f.topic ?? s.topic ?? null,
    collocationsText: pick(f.collocationsText, s.collocations.join('\n')),
    wordFamilyText: pick(f.wordFamilyText, s.wordFamily.map((w) => (w.partOfSpeech ? `${w.word} (${w.partOfSpeech})` : w.word)).join('\n')),
    examples:
      f.examples.some((x) => squash(x.sentence)) || s.examples.length === 0
        ? f.examples
        : s.examples.map((x) => ({ sentence: x.sentence, translationFa: x.translationFa ?? '' })),
  };
  if (form.topic !== f.topic) filled += 1;
  if (form.examples !== f.examples) filled += 1;
  return { form, filled };
}
