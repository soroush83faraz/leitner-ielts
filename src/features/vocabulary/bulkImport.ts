import { normalizeTerm, squash, TERM_PROBLEM_FA, validateTerm } from '@/utils/text';

import type { DuplicateHit } from '@/database/repositories/vocabularyRepo';

export const BULK_MAX_LINES = 500;
export const BULK_MAX_CHARS = 60_000;
/** Cards sent to the AI per request when enriching a batch. */
export const BULK_AI_BATCH_SIZE = 8;

export type BulkRowStatus = 'new' | 'needs_details' | 'duplicate_existing' | 'duplicate_batch' | 'invalid';

export interface ParsedLine {
  /** 1-based line number in the pasted text (blank lines counted). */
  line: number;
  term: string;
  meaningFa: string | null;
}

export interface BulkRow extends ParsedLine {
  normalized: string;
  status: BulkRowStatus;
  reason?: string;
  existing?: DuplicateHit;
}

export interface ParseOutcome {
  lines: ParsedLine[];
  truncated: boolean;
}

/**
 * Supported formats, one entry per line:
 *   term
 *   term<TAB>meaning
 * Only a TAB separates a meaning. Commas, dashes, colons etc. are part of the
 * term, because phrases legitimately contain them.
 */
export function parseBulkText(input: string): ParseOutcome {
  const text = input.replace(/^﻿/, '').slice(0, BULK_MAX_CHARS);
  const lines: ParsedLine[] = [];
  let truncated = input.length > BULK_MAX_CHARS;
  for (const [i, raw] of text.split(/\r\n|\r|\n/).entries()) {
    if (!raw.trim()) continue;
    if (lines.length >= BULK_MAX_LINES) {
      truncated = true;
      break;
    }
    const tab = raw.indexOf('\t');
    const term = squash(tab === -1 ? raw : raw.slice(0, tab));
    const meaning = tab === -1 ? '' : squash(raw.slice(tab + 1));
    lines.push({ line: i + 1, term, meaningFa: meaning || null });
  }
  return { lines, truncated };
}

/** Assigns each parsed line a status, checking the batch and the existing library. */
export function classifyRows(lines: ParsedLine[], existing: Map<string, DuplicateHit>): BulkRow[] {
  const seen = new Set<string>();
  return lines.map((l) => {
    const normalized = normalizeTerm(l.term);
    const problem = validateTerm(l.term);
    if (problem) return { ...l, normalized, status: 'invalid', reason: TERM_PROBLEM_FA[problem] };
    const hit = existing.get(normalized);
    if (hit) {
      seen.add(normalized);
      return { ...l, normalized, status: 'duplicate_existing', existing: hit, reason: 'از قبل در کتابخانه شما هست.' };
    }
    if (seen.has(normalized)) {
      return { ...l, normalized, status: 'duplicate_batch', reason: 'در همین فهرست تکرار شده است.' };
    }
    seen.add(normalized);
    return { ...l, normalized, status: l.meaningFa ? 'new' : 'needs_details' };
  });
}

export function isSelectableByDefault(row: BulkRow): boolean {
  return row.status === 'new' || row.status === 'needs_details';
}

export function summarize(rows: BulkRow[]) {
  const count = (s: BulkRowStatus) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    new: count('new'),
    needsDetails: count('needs_details'),
    duplicates: count('duplicate_existing') + count('duplicate_batch'),
    invalid: count('invalid'),
  };
}

/** Splits into request-sized batches for AI enrichment. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
