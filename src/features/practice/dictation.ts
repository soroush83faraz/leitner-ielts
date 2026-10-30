/**
 * Dictation checking. Normalises case, punctuation, spacing and curly quotes,
 * then aligns word by word. A near-miss (one or two letters off) is reported as a
 * spelling mistake, never silently accepted; a different word is "wrong".
 */

export type TokenStatus = 'ok' | 'spelling' | 'wrong' | 'missing' | 'extra';
export type DictationVerdict = 'correct' | 'spelling_error' | 'different';

export interface TokenResult {
  expected: string | null;
  typed: string | null;
  status: TokenStatus;
}

export interface DictationResult {
  verdict: DictationVerdict;
  tokens: TokenResult[];
}

export function tokenize(s: string): string[] {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-']+|[-']+$/g, ''))
    .filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Within typo distance: 1 edit for words up to 5 letters, 2 for longer ones; the first letter must match. */
function isNear(expected: string, typed: string): boolean {
  if (expected.length < 3 || expected[0] !== typed[0]) return false;
  const max = expected.length <= 5 ? 1 : 2;
  return levenshtein(expected, typed) <= max;
}

export function checkDictation(expected: string, typed: string): DictationResult {
  const e = tokenize(expected);
  const t = tokenize(typed);
  const n = e.length;
  const m = t.length;

  // dp[i][j]: cheapest alignment of e[0..i) with t[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i;
  for (let j = 1; j <= m; j++) dp[0][j] = j;
  const subCost = (a: string, b: string) => (a === b ? 0 : isNear(a, b) ? 0.5 : 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + subCost(e[i - 1], t[j - 1]));
    }
  }

  const tokens: TokenResult[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + subCost(e[i - 1], t[j - 1])) {
      const same = e[i - 1] === t[j - 1];
      tokens.push({ expected: e[i - 1], typed: t[j - 1], status: same ? 'ok' : isNear(e[i - 1], t[j - 1]) ? 'spelling' : 'wrong' });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      tokens.push({ expected: e[i - 1], typed: null, status: 'missing' });
      i--;
    } else {
      tokens.push({ expected: null, typed: t[j - 1], status: 'extra' });
      j--;
    }
  }
  tokens.reverse();

  const bad = tokens.filter((x) => x.status === 'wrong' || x.status === 'missing' || x.status === 'extra');
  const near = tokens.filter((x) => x.status === 'spelling');
  const verdict: DictationVerdict = bad.length > 0 ? 'different' : near.length > 0 ? 'spelling_error' : 'correct';
  return { verdict, tokens: m === 0 ? tokens.map((x) => ({ ...x, status: 'missing' as const })) : tokens };
}
