/**
 * Pure post-processing of model output. Pure so it can be unit-tested from the
 * app's Jest suite; no relative imports so Deno and Metro both load it.
 */

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** True when `excerpt` occurs verbatim (ignoring case/whitespace/curly quotes) in `source`. */
export function excerptInSource(source: string, excerpt: string): boolean {
  const e = norm(excerpt);
  return e.length > 0 && norm(source).includes(e);
}

/** Loose check that an (possibly inflected) term appears in a sentence: shared prefix >= max(4, len-3). */
export function termInSentence(term: string, sentence: string): boolean {
  const t = norm(term);
  const s = norm(sentence);
  if (!t) return false;
  if (s.includes(t)) return true;
  const words = t.split(' ');
  return words.every((w) => {
    const need = Math.min(w.length, Math.max(4, w.length - 3));
    const prefix = w.slice(0, need);
    return s.split(/[^a-z0-9'-]+/).some((token) => token.startsWith(prefix));
  });
}

export interface RawCandidate {
  term: string;
  sourceSentence: string;
  [k: string]: unknown;
}

/**
 * Keeps at most `limit` unique candidates. A candidate whose quoted sentence is
 * not found in the user's text (or does not contain the term) is NOT dropped
 * silently into the saved data: its sentence is nulled and it is flagged
 * `sourceVerified: false`, so the app never stores an invented source.
 */
export function verifyCandidates<T extends RawCandidate>(
  text: string,
  candidates: T[],
  limit: number,
): (Omit<T, 'sourceSentence'> & { sourceSentence: string | null; sourceVerified: boolean })[] {
  const seen = new Set<string>();
  const out: (Omit<T, 'sourceSentence'> & { sourceSentence: string | null; sourceVerified: boolean })[] = [];
  for (const c of candidates) {
    const key = norm(c.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const verified = excerptInSource(text, c.sourceSentence) && termInSentence(c.term, c.sourceSentence);
    out.push({ ...c, sourceSentence: verified ? c.sourceSentence : null, sourceVerified: verified });
    if (out.length >= limit) break;
  }
  return out;
}

/** Pulls the first JSON object out of a model reply (tolerates code fences and prose). */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no_json_object');
  return JSON.parse(raw.slice(start, end + 1));
}
