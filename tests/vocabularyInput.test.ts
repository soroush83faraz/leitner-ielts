import { chunk, classifyRows, isSelectableByDefault, parseBulkText, summarize } from '@/features/vocabulary/bulkImport';
import { vocabularyInputSchema } from '@/features/vocabulary/model';
import { excerptAppearsIn, normalizeTerm, toPersianDigits, validateTerm } from '@/utils/text';

import type { DuplicateHit } from '@/database/repositories/vocabularyRepo';

describe('term validation and normalisation', () => {
  it('rejects blank, over-long and non-English terms', () => {
    expect(validateTerm('')).toBe('empty');
    expect(validateTerm('   \t ')).toBe('empty');
    expect(validateTerm('x'.repeat(81))).toBe('too_long');
    expect(validateTerm('کتاب')).toBe('no_latin_letters');
    expect(validateTerm('well-being')).toBeNull();
    expect(validateTerm('take off')).toBeNull();
  });

  it('the input schema rejects a blank term', () => {
    expect(vocabularyInputSchema.safeParse({ term: '   ' }).success).toBe(false);
    expect(vocabularyInputSchema.safeParse({ term: 'ok' }).success).toBe(true);
  });

  it('normalises case, whitespace and quotes but never merges distinct phrases', () => {
    expect(normalizeTerm('  Take   OFF ')).toBe('take off');
    expect(normalizeTerm('“Resilient”.')).toBe('resilient');
    expect(normalizeTerm('don’t')).toBe("don't");
    expect(normalizeTerm('take on')).not.toBe(normalizeTerm('take off'));
    expect(normalizeTerm('run')).not.toBe(normalizeTerm('running'));
  });

  it('formats Persian digits', () => {
    expect(toPersianDigits(1204)).toBe('۱۲۰۴');
  });
});

describe('bulk parsing', () => {
  it('trims whitespace and ignores blank lines, keeping real line numbers', () => {
    const { lines } = parseBulkText('  alpha  \n\n   \r\nbeta\r\n\tgamma');
    expect(lines.map((l) => [l.line, l.term])).toEqual([[1, 'alpha'], [4, 'beta'], [5, '']]);
  });

  it('parses term<TAB>meaning rows and keeps extra tabs in the meaning', () => {
    const { lines } = parseBulkText('mitigate\tکاهش دادن\nresilient\tمقاوم\tانعطاف‌پذیر\ncarry out\t');
    expect(lines[0]).toMatchObject({ term: 'mitigate', meaningFa: 'کاهش دادن' });
    expect(lines[1].meaningFa).toBe('مقاوم انعطاف‌پذیر');
    expect(lines[2]).toMatchObject({ term: 'carry out', meaningFa: null });
  });

  it('does not treat commas, dashes or colons as separators', () => {
    const { lines } = parseBulkText('by and large, mostly\nwell-being - health\nnote: this');
    expect(lines.map((l) => l.term)).toEqual(['by and large, mostly', 'well-being - health', 'note: this']);
    expect(lines.every((l) => l.meaningFa === null)).toBe(true);
  });

  it('caps input size and reports truncation', () => {
    const many = Array.from({ length: 600 }, (_, i) => `word${i}`).join('\n');
    const out = parseBulkText(many);
    expect(out.lines).toHaveLength(500);
    expect(out.truncated).toBe(true);
  });
});

describe('bulk classification', () => {
  const existing = new Map<string, DuplicateHit>([['mitigate', { id: 'e1', term: 'Mitigate', meaningFa: 'x', archived: false }]]);

  it('flags invalid, duplicate-in-library, duplicate-in-batch, new and needs-details', () => {
    const { lines } = parseBulkText('Mitigate\nresilient\tمقاوم\nRESILIENT\nجدید\nvolatile\n‌');
    const rows = classifyRows(lines, existing);
    expect(rows.map((r) => r.status)).toEqual([
      'duplicate_existing',
      'new',
      'duplicate_batch',
      'invalid',
      'needs_details',
      'invalid',
    ]);
    expect(rows[0].existing?.id).toBe('e1');
  });

  it('only new and needs-details rows are selected by default, and a summary adds up', () => {
    const rows = classifyRows(parseBulkText('a1\nb1\tx\nb1\n???').lines, new Map());
    expect(rows.filter(isSelectableByDefault).map((r) => r.term)).toEqual(['a1', 'b1']);
    expect(summarize(rows)).toEqual({ total: 4, new: 1, needsDetails: 1, duplicates: 1, invalid: 1 });
  });

  it('chunks into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('excerpt matching', () => {
  const source = 'The  city’s   air quality has improved.\nResidents are pleased.';
  it('matches ignoring case, whitespace and curly quotes', () => {
    expect(excerptAppearsIn(source, "the city's air quality has improved.")).toBe(true);
  });
  it('rejects invented text', () => {
    expect(excerptAppearsIn(source, 'The air quality has worsened.')).toBe(false);
    expect(excerptAppearsIn(source, '')).toBe(false);
  });
});
