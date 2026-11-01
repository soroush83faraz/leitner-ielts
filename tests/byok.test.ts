import { BYOK_DEFAULTS, createByokAiService, createDirectProvider, isAllowedBaseUrl, testByokConnection, validateByokConfig, type ByokConfig } from '@/services/ai/byok';
import { AiError } from '@/services/ai/errors';
import * as rt from '@/services/ai/runtime';
import * as store from '@/services/ai/secretStore';

jest.mock('@/services/ai/secretStore', () => {
  let stored: string | null = null;
  return {
    readSecret: jest.fn(async () => stored),
    writeSecret: jest.fn(async (v: string) => ((stored = v), true)),
    deleteSecret: jest.fn(async () => void (stored = null)),
  };
});

const anthropic: ByokConfig = { provider: 'anthropic', apiKey: 'test-key-ABCD1234', model: 'claude-sonnet-5-5', baseUrl: '' };
const openai: ByokConfig = { provider: 'openai', apiKey: 'test-key-WXYZ9876', model: 'gpt-test', baseUrl: 'https://llm.example.com/v1/' };

const card = { term: 'x', meaningFa: 'کاهش دادن', definitionEn: null, partOfSpeech: 'verb', ipa: null, examples: [], collocations: [], wordFamily: [], topic: null, entryType: 'word' };
const anthropicReply = (obj: unknown) => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(obj) }] }), { status: 200 });
const openaiReply = (obj: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: `Sure:\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`` } }] }), { status: 200 });
const asFetch = (f: unknown) => f as typeof fetch;

describe('config validation', () => {
  it('requires a key, a model and an https base URL (localhost http allowed)', () => {
    expect(validateByokConfig(anthropic)).toBeNull();
    expect(validateByokConfig({ ...anthropic, apiKey: ' short ' })).toMatch(/کلید/);
    expect(validateByokConfig({ ...anthropic, model: ' ' })).toMatch(/مدل/);
    expect(validateByokConfig({ ...openai, baseUrl: 'http://evil.example.com' })).toMatch(/https/);
    expect(isAllowedBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isAllowedBaseUrl('https://openrouter.ai/api/v1')).toBe(true);
    expect(isAllowedBaseUrl('javascript:alert(1)')).toBe(false);
    expect(BYOK_DEFAULTS.anthropic.model).toBeTruthy();
  });
});

describe('direct providers', () => {
  it('Anthropic: calls the Messages API with the learner key and no other host', async () => {
    const f = jest.fn(async () => anthropicReply({ ok: true }));
    await createDirectProvider(anthropic, asFetch(f)).completeJson({ system: 's', user: 'u', maxTokens: 50, timeoutMs: 1000 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(anthropic.apiKey);
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 50, system: 's' });
  });

  it('OpenAI-compatible: honours the base URL and parses fenced JSON', async () => {
    const f = jest.fn(async () => openaiReply({ a: 1 }));
    const out = await createDirectProvider(openai, asFetch(f)).completeJson({ system: 's', user: 'u', maxTokens: 50, timeoutMs: 1000 });
    expect(out).toEqual({ a: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${openai.apiKey}`);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const f = jest.fn(async () => new Response('{}', { status }));
    await expect(createDirectProvider(anthropic, asFetch(f)).completeJson({ system: '', user: '', maxTokens: 5, timeoutMs: 100 })).rejects.toMatchObject({ kind });
  });

  it('maps a network failure to offline and a hang to timeout', async () => {
    await expect(createDirectProvider(anthropic, asFetch(async () => { throw new TypeError('x'); })).completeJson({ system: '', user: '', maxTokens: 5, timeoutMs: 100 })).rejects.toMatchObject({ kind: 'offline' });
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
    await expect(createDirectProvider(anthropic, asFetch(hang)).completeJson({ system: '', user: '', maxTokens: 5, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('a reply that is not JSON is invalid_output', async () => {
    const f = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'sorry, no json' }] }), { status: 200 });
    await expect(createDirectProvider(anthropic, asFetch(f)).completeJson({ system: '', user: '', maxTokens: 5, timeoutMs: 100 })).rejects.toMatchObject({ kind: 'invalid_output' });
  });
});

describe('BYOK service runs the same operations as the server', () => {
  it('generateCard returns a validated card and keeps the learner’s term', async () => {
    const svc = createByokAiService(anthropic, asFetch(async () => anthropicReply({ card: { ...card, term: 'CHANGED' } })));
    const out = await svc.generateCard({ term: 'mitigate' });
    expect(out).toMatchObject({ term: 'mitigate', meaningFa: 'کاهش دادن' });
  });

  it('retries once on unusable output, then succeeds', async () => {
    let n = 0;
    const svc = createByokAiService(anthropic, asFetch(async () => (n++ === 0 ? anthropicReply({ card: { term: 'x' } }) : anthropicReply({ card }))));
    await expect(svc.generateCard({ term: 'mitigate' })).resolves.toMatchObject({ meaningFa: 'کاهش دادن' });
    expect(n).toBe(2);
  });

  it('gives invalid_response after two bad outputs', async () => {
    const svc = createByokAiService(anthropic, asFetch(async () => anthropicReply({ nope: true })));
    await expect(svc.generateCard({ term: 'mitigate' })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects bad input before any network call', async () => {
    const f = jest.fn();
    const svc = createByokAiService(anthropic, asFetch(f));
    await expect(svc.generateCard({ term: ' ' })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(svc.extractVocabulary({ text: 'a'.repeat(10_001) })).rejects.toMatchObject({ code: 'too_large' });
    expect(f).not.toHaveBeenCalled();
  });

  it('a rejected key surfaces as unauthorized (and is not retried)', async () => {
    const f = jest.fn(async () => new Response('{}', { status: 401 }));
    const svc = createByokAiService(anthropic, asFetch(f));
    await expect(svc.generateCard({ term: 'mitigate' })).rejects.toMatchObject({ code: 'unauthorized' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('extraction nulls a source sentence the model invented', async () => {
    const text = 'Governments must mitigate the effects of climate change. Residents are pleased by the new parks.';
    const reply = { candidates: [{ term: 'mitigate', entryType: 'word', meaningInContext: 'کاهش', sourceSentence: 'Something never written.', difficulty: 'B2', topic: null }] };
    const svc = createByokAiService(anthropic, asFetch(async () => anthropicReply(reply)));
    const out = await svc.extractVocabulary({ text });
    expect(out[0]).toMatchObject({ sourceVerified: false, sourceSentence: null });
  });

  it('connection test passes with a valid key and throws a typed error otherwise', async () => {
    await expect(testByokConnection(anthropic, asFetch(async () => anthropicReply({ ok: true })))).resolves.toBeUndefined();
    await expect(testByokConnection(anthropic, asFetch(async () => new Response('{}', { status: 401 })))).rejects.toBeInstanceOf(AiError);
    await expect(testByokConnection(anthropic, asFetch(async () => new Response('{}', { status: 401 })))).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

describe('runtime mode', () => {
  it('own key wins, shows only a key hint, and removal falls back to none', async () => {
    expect(rt.getAiMode()).toBe('none');
    expect(rt.aiService.configured).toBe(false);
    await expect(rt.aiService.generateCard({ term: 'mitigate' })).rejects.toMatchObject({ code: 'not_configured' });

    await rt.saveOwnKey(anthropic);
    expect(rt.getAiMode()).toBe('own-key');
    expect(rt.aiService.configured).toBe(true);

    await rt.clearOwnKey();
    expect(rt.getAiMode()).toBe('none');
  });

  it('refuses to save an invalid config', async () => {
    await expect(rt.saveOwnKey({ ...anthropic, apiKey: '' })).rejects.toBeInstanceOf(AiError);
    expect(rt.getAiMode()).toBe('none');
  });

  it('restores a saved key at startup', async () => {
    await store.writeSecret(JSON.stringify(openai));
    await rt.loadSavedKey();
    expect(rt.getAiMode()).toBe('own-key');
    await rt.clearOwnKey();
    await store.writeSecret('{corrupt');
    await rt.loadSavedKey(); // must not throw
    expect(rt.getAiMode()).toBe('none');
  });
});
