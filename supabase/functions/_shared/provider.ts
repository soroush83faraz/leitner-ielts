/**
 * Provider-agnostic LLM boundary (Deno). The rest of the server only knows
 * `LlmProvider`; swap the implementation here (or via AI_PROVIDER) without
 * touching handlers. Keys come from Edge Function secrets, never from the client.
 */
import { ProviderError, type CompleteArgs, type LlmProvider } from './llm.ts';
import { extractJsonObject } from './verify.ts';

class AnthropicProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async completeJson({ system, user, maxTokens, timeoutMs }: CompleteArgs): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') throw new ProviderError('timeout');
      throw new ProviderError('provider_error');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) throw new ProviderError('rate_limited');
    if (!res.ok) throw new ProviderError('provider_error', `status ${res.status}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    try {
      return extractJsonObject(text);
    } catch {
      throw new ProviderError('invalid_output');
    }
  }
}

export function getProvider(): LlmProvider {
  const name = Deno.env.get('AI_PROVIDER') ?? 'anthropic';
  if (name === 'anthropic') {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) throw new ProviderError('not_configured');
    return new AnthropicProvider(key, Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5-5');
  }
  throw new ProviderError('not_configured', `unknown AI_PROVIDER "${name}"`);
}
