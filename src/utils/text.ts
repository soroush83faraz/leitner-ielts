/** Collapses runs of whitespace and trims. */
export function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Key used for duplicate detection: case/whitespace/quote-insensitive, but it
 * does NOT stem or reorder, so distinct phrases ("take off" vs "take on") stay
 * distinct.
 */
export function normalizeTerm(term: string): string {
  return squash(
    term
      .normalize('NFKC')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐-―]/g, '-')
      .toLowerCase(),
  )
    .replace(/^[\s"'(\[]+|[\s"'.,;:!?)\]]+$/g, '')
    .trim();
}

export const MAX_TERM_LENGTH = 80;

export type TermProblem = 'empty' | 'too_long' | 'no_latin_letters';

/** English headwords must contain at least one Latin letter. */
export function validateTerm(term: string): TermProblem | null {
  const t = squash(term);
  if (!t) return 'empty';
  if (t.length > MAX_TERM_LENGTH) return 'too_long';
  if (!/[A-Za-z]/.test(t)) return 'no_latin_letters';
  return null;
}

export const TERM_PROBLEM_FA: Record<TermProblem, string> = {
  empty: 'واژه نمی‌تواند خالی باشد.',
  too_long: `واژه یا عبارت بیش از ${MAX_TERM_LENGTH} نویسه است.`,
  no_latin_letters: 'واژه باید حروف انگلیسی داشته باشد.',
};

/** Matches an AI-quoted excerpt against the source text (case/whitespace-insensitive). */
export function excerptAppearsIn(source: string, excerpt: string): boolean {
  const norm = (s: string) => squash(s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')).toLowerCase();
  const e = norm(excerpt);
  return e.length > 0 && norm(source).includes(e);
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** 123 -> ۱۲۳ for Persian UI. */
export function toPersianDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}
