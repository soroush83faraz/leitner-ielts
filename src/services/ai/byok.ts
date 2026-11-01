/**
 * "Bring your own key": the learner connects their own provider account and the app calls the
 * provider directly from the device, running the very same operations (prompts, Zod validation,
 * source-sentence verification) the server uses. Nothing passes through the app's backend and the
 * key never leaves the device except in requests to the provider the learner chose.
 */

import { extractJsonObject } from '../../../supabase/functions/_shared/verify';
import { ProviderError, type CompleteArgs, type LlmProvider } from '../../../supabase/functions/_shared/llm';
import { evaluateOp, extractOp, generateCardOp, practiceOp, type Operation } from '../../../supabase/functions/_shared/operations';
import type {
  CardSuggestion,
  EvaluateRequest,
  Evaluation,
  ExtractRequest,
  ExtractedCandidate,
  GenerateCardRequest,
  GenerateCardsRequest,
  GenerateCardsResponse,
  GeneratePracticeRequest,
  PracticeTask,
} from '../../../supabase/functions/_shared/contracts';
import type { AiService } from './client';
import { AiError } from './errors';

export type ByokProvider = 'anthropic' | 'openai';

export interface ByokConfig {
  provider: ByokProvider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible only (OpenAI, OpenRouter, a local Ollama…). */
  baseUrl: string;
}

export const BYOK_DEFAULTS: Record<ByokProvider, { model: string; baseUrl: string; label: string }> = {
  anthropic: { model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com', label: 'Anthropic (Claude)' },
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', label: 'سازگار با OpenAI' },
};

const TIMEOUT_MS = 45_000;

/** https only, except for a model running on the same device (e.g. Ollama). */
export function isAllowedBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function validateByokConfig(c: ByokConfig): string | null {
  if (c.apiKey.trim().length < 8) return 'کلید API را وارد کنید.';
  if (!c.model.trim()) return 'نام مدل را وارد کنید.';
  if (c.provider === 'openai' && !isAllowedBaseUrl(c.baseUrl.trim())) return 'نشانی سرویس باید با https شروع شود.';
  return null;
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, fetchImpl: typeof fetch): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw new ProviderError('timeout');
    throw new ProviderError('offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('unauthorized');
  if (res.status === 429) throw new ProviderError('rate_limited');
  if (!res.ok) throw new ProviderError('provider_error', `status ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new ProviderError('invalid_output');
  }
}

function parseModelJson(text: string): unknown {
  try {
    return extractJsonObject(text);
  } catch {
    throw new ProviderError('invalid_output');
  }
}

export function createDirectProvider(cfg: ByokConfig, fetchImpl: typeof fetch = fetch): LlmProvider {
  const model = cfg.model.trim();
  if (cfg.provider === 'anthropic') {
    return {
      async completeJson({ system, user, maxTokens, timeoutMs }: CompleteArgs) {
        const body = (await post(
          `${BYOK_DEFAULTS.anthropic.baseUrl}/v1/messages`,
          {
            'x-api-key': cfg.apiKey.trim(),
            'anthropic-version': '2023-06-01',
            // Required by Anthropic for calls made straight from a browser (web preview only).
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
          Math.min(timeoutMs, TIMEOUT_MS),
          fetchImpl,
        )) as { content?: { type: string; text?: string }[] };
        const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
        return parseModelJson(text);
      },
    };
  }
  const base = cfg.baseUrl.trim().replace(/\/+$/, '');
  return {
    async completeJson({ system, user, maxTokens, timeoutMs }: CompleteArgs) {
      const body = (await post(
        `${base}/chat/completions`,
        { authorization: `Bearer ${cfg.apiKey.trim()}` },
        { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
        Math.min(timeoutMs, TIMEOUT_MS),
        fetchImpl,
      )) as { choices?: { message?: { content?: string } }[] };
      return parseModelJson(body.choices?.[0]?.message?.content ?? '');
    },
  };
}

function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof ProviderError) {
    switch (e.kind) {
      case 'timeout':
        return new AiError('timeout');
      case 'offline':
        return new AiError('offline');
      case 'rate_limited':
        return new AiError('rate_limited');
      case 'unauthorized':
        return new AiError('unauthorized');
      case 'invalid_output':
        return new AiError('invalid_response');
      default:
        return new AiError('provider_error');
    }
  }
  return new AiError('invalid_response'); // schema failures on model output
}

/** Mirrors the server handler: validate input, run, validate output, retry once on unusable output. */
async function runOperation(op: Operation, request: unknown, provider: LlmProvider): Promise<unknown> {
  const parsed = op.request.safeParse(request);
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.code === 'too_big');
    throw new AiError(tooBig ? 'too_large' : 'bad_request');
  }
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await op.run(parsed.data, provider);
      const checked = op.response.safeParse(result);
      if (!checked.success) throw new ProviderError('invalid_output');
      return checked.data;
    } catch (e) {
      last = e;
      const retryable = !(e instanceof ProviderError) || e.kind === 'invalid_output';
      if (!retryable) break;
    }
  }
  throw toAiError(last);
}

export function createByokAiService(cfg: ByokConfig, fetchImpl: typeof fetch = fetch): AiService {
  const provider = createDirectProvider(cfg, fetchImpl);
  const run = <T>(op: Operation, req: unknown) => runOperation(op, req, provider) as Promise<T>;
  return {
    configured: true,
    async generateCard(req: GenerateCardRequest): Promise<CardSuggestion> {
      return (await run<{ card: CardSuggestion }>(generateCardOp, req)).card;
    },
    async generateCards(req: GenerateCardsRequest): Promise<GenerateCardsResponse['results']> {
      return (await run<GenerateCardsResponse>(generateCardOp, req)).results;
    },
    async extractVocabulary(req: ExtractRequest): Promise<ExtractedCandidate[]> {
      return (await run<{ candidates: ExtractedCandidate[] }>(extractOp, req)).candidates;
    },
    async generatePractice(req: GeneratePracticeRequest): Promise<PracticeTask> {
      return (await run<{ task: PracticeTask }>(practiceOp, req)).task;
    },
    async evaluateWriting(req: EvaluateRequest): Promise<Evaluation> {
      return (await run<{ evaluation: Evaluation }>(evaluateOp, req)).evaluation;
    },
  };
}

/** One tiny request to check the key and model before saving. Costs a handful of tokens. */
export async function testByokConnection(cfg: ByokConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
  const provider = createDirectProvider(cfg, fetchImpl);
  try {
    await provider.completeJson({ system: 'Reply with exactly this JSON object and nothing else: {"ok":true}', user: 'ping', maxTokens: 20, timeoutMs: 20_000 });
  } catch (e) {
    throw toAiError(e);
  }
}

