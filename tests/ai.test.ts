import fs from 'node:fs';
import path from 'node:path';

import { createAnonymousAuth, type StoredSession } from '@/services/ai/anonymousAuth';
import { createHttpAiService, createUnconfiguredAiService } from '@/services/ai/client';
import { AiError, describeAiError } from '@/services/ai/errors';
import { extractJsonObject, verifyCandidates } from '../supabase/functions/_shared/verify';

const card = {
  term: 'mitigate',
  meaningFa: 'کاهش دادن',
  definitionEn: 'make less severe',
  partOfSpeech: 'verb',
  ipa: '/ˈmɪtɪɡeɪt/',
  examples: [{ sentence: 'Trees mitigate heat.', translationFa: 'درختان گرما را کاهش می‌دهند.' }],
  collocations: ['mitigate the effects'],
  wordFamily: [{ word: 'mitigation', partOfSpeech: 'noun' }],
  topic: 'Environment',
  entryType: 'word',
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
}

function service(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createHttpAiService>[0]> = {}) {
  return createHttpAiService({
    functionsUrl: 'https://x.supabase.co/functions/v1',
    publishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxx',
    getAccessToken: async () => 'jwt',
    fetchImpl,
    retryDelayMs: 1,
    timeoutMs: 50,
    ...extra,
  });
}

describe('generate-card contract', () => {
  it('accepts a schema-valid response and sends auth headers', async () => {
    const f = jest.fn(async () => json({ card }));
    const out = await service(f as unknown as typeof fetch).generateCard({ term: 'mitigate' });
    expect(out.meaningFa).toBe('کاهش دادن');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/functions/v1/generate-card');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
  });

  it.each([
    ['missing required field', { card: { ...card, meaningFa: undefined } }],
    ['wrong type', { card: { ...card, examples: 'nope' } }],
    ['no card at all', { hello: 1 }],
    ['unknown topic', { card: { ...card, topic: 'Cooking' } }],
  ])('rejects a malformed response (%s) as invalid_response', async (_n, body) => {
    const f = jest.fn(async () => json(body));
    await expect(service(f as unknown as typeof fetch).generateCard({ term: 'mitigate' })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects blank or oversized input before any network call', async () => {
    const f = jest.fn();
    const s = service(f as unknown as typeof fetch);
    await expect(s.generateCard({ term: '  ' })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(s.generateCard({ term: 'x'.repeat(200) })).rejects.toMatchObject({ code: 'too_large' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('failure modes are typed, retried where safe, and never throw raw errors', () => {
  it('offline: network failure -> offline after one retry', async () => {
    const f = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(service(f as unknown as typeof fetch).generateCard({ term: 'a' })).rejects.toMatchObject({ code: 'offline' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('timeout: aborts a hanging request', async () => {
    const f = jest.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    await expect(service(f as unknown as typeof fetch).generateCard({ term: 'a' })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('rate limit: not retried, exposes Retry-After', async () => {
    const f = jest.fn(async () => json({}, { status: 429, headers: { 'Retry-After': '42' } }));
    await expect(service(f as unknown as typeof fetch).generateCard({ term: 'a' })).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 42 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('server error: retried once, then succeeds', async () => {
    let n = 0;
    const f = jest.fn(async () => (n++ === 0 ? json({ error: { code: 'provider_error', message: 'x' } }, { status: 502 }) : json({ card })));
    await expect(service(f as unknown as typeof fetch).generateCard({ term: 'a' })).resolves.toMatchObject({ term: 'mitigate' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('401: refreshes the session once and replays', async () => {
    let n = 0;
    const invalidate = jest.fn(async () => undefined);
    const f = jest.fn(async () => (n++ === 0 ? json({}, { status: 401 }) : json({ card })));
    const s = service(f as unknown as typeof fetch, { invalidateToken: invalidate });
    await expect(s.generateCard({ term: 'a' })).resolves.toBeTruthy();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('error messages shown to users are Persian and never echo input', () => {
    const { message } = describeAiError(new AiError('offline'));
    expect(message).toMatch(/اینترنت/);
    expect(describeAiError(new Error('secret sk-123')).message).not.toMatch(/sk-123/);
  });

  it('unconfigured service fails with not_configured and returns no fake data', async () => {
    const s = createUnconfiguredAiService();
    expect(s.configured).toBe(false);
    await expect(s.generateCard({ term: 'a' })).rejects.toMatchObject({ code: 'not_configured' });
    await expect(s.extractVocabulary({ text: 'x'.repeat(40) })).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('extract-vocabulary', () => {
  const text = 'Governments must mitigate the effects of climate change. Residents are pleased by the new parks.';
  const good = {
    term: 'mitigate',
    entryType: 'word',
    meaningInContext: 'کاهش دادن',
    sourceSentence: 'Governments must mitigate the effects of climate change.',
    difficulty: 'B2',
    topic: 'Environment',
  };

  it('keeps verified candidates', async () => {
    const f = jest.fn(async () => json({ candidates: [{ ...good, sourceVerified: true }] }));
    const out = await service(f as unknown as typeof fetch).extractVocabulary({ text });
    expect(out[0]).toMatchObject({ term: 'mitigate', sourceVerified: true });
  });

  it('never trusts a server "verified" flag: an invented sentence is nulled', async () => {
    const f = jest.fn(async () =>
      json({ candidates: [{ ...good, sourceSentence: 'Governments should ignore climate change.', sourceVerified: true }] }),
    );
    const out = await service(f as unknown as typeof fetch).extractVocabulary({ text });
    expect(out[0]).toMatchObject({ sourceSentence: null, sourceVerified: false });
  });

  it('enforces the 10,000 character limit on the client', async () => {
    const f = jest.fn();
    await expect(service(f as unknown as typeof fetch).extractVocabulary({ text: 'a'.repeat(10_001) })).rejects.toMatchObject({ code: 'too_large' });
    expect(f).not.toHaveBeenCalled();
  });

  it('server-side verification nulls invented sentences, dedupes and limits', () => {
    const out = verifyCandidates(
      text,
      [
        { term: 'mitigate', sourceSentence: 'Governments must mitigate the effects of climate change.' },
        { term: 'Mitigate', sourceSentence: 'Governments must mitigate the effects of climate change.' },
        { term: 'pleased', sourceSentence: 'The mayor was pleased.' },
        { term: 'residents', sourceSentence: 'Residents are pleased by the new parks.' },
      ],
      3,
    );
    expect(out.map((c) => [c.term, c.sourceVerified])).toEqual([
      ['mitigate', true],
      ['pleased', false],
      ['residents', true],
    ]);
    expect(out[1].sourceSentence).toBeNull();
  });

  it('extracts JSON from a fenced model reply', () => {
    expect(extractJsonObject('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJsonObject('no json here')).toThrow();
  });
});

describe('anonymous auth', () => {
  function memoryStore() {
    let s: StoredSession | null = null;
    return { load: async () => s, save: async (v: StoredSession) => void (s = v), clear: async () => void (s = null), peek: () => s };
  }

  it('creates a session once, then reuses it until near expiry', async () => {
    const store = memoryStore();
    const f = jest.fn(async () => json({ access_token: 'a1', refresh_token: 'r1', expires_at: 10_000 }));
    const auth = createAnonymousAuth({ supabaseUrl: 'https://x.supabase.co', publishableKey: 'k', store, fetchImpl: f as unknown as typeof fetch, now: () => 1_000 });
    expect(await auth.getAccessToken()).toBe('a1');
    expect(await auth.getAccessToken()).toBe('a1');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expiring session with the refresh token', async () => {
    const store = memoryStore();
    await store.save({ accessToken: 'old', refreshToken: 'r1', expiresAt: 1_030 });
    const f = jest.fn(async () => json({ access_token: 'new', refresh_token: 'r2', expires_at: 9_999 }));
    const auth = createAnonymousAuth({ supabaseUrl: 'https://x.supabase.co', publishableKey: 'k', store, fetchImpl: f as unknown as typeof fetch, now: () => 1_000 });
    expect(await auth.getAccessToken()).toBe('new');
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('grant_type=refresh_token');
  });

  it('concurrent callers share one sign-in', async () => {
    const store = memoryStore();
    const f = jest.fn(async () => json({ access_token: 'a', refresh_token: 'r', expires_at: 99_999 }));
    const auth = createAnonymousAuth({ supabaseUrl: 'https://x.supabase.co', publishableKey: 'k', store, fetchImpl: f as unknown as typeof fetch, now: () => 1 });
    await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('client code never references AI provider credentials', () => {
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.(ts|tsx|js|json)$/.test(e.name) ? [p] : [];
    });
  }
  const root = path.resolve(__dirname, '..');
  const clientFiles = [...walk(path.join(root, 'src')), path.join(root, 'app.json')];
  const forbidden = /ANTHROPIC_API_KEY|OPENAI_API_KEY|SERVICE_ROLE|service_role|sk-ant-|api\.anthropic\.com|api\.openai\.com/;

  it('has no provider keys, service-role keys or provider URLs in src/ or app.json', () => {
    const offenders = clientFiles.filter((f) => forbidden.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only exposes public Expo env vars that are URL / publishable key', () => {
    const pub = new Set<string>();
    for (const f of clientFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/EXPO_PUBLIC_[A-Z_]+/g)) pub.add(m[0]);
    expect([...pub].sort()).toEqual(['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_SUPABASE_URL']);
  });
});
