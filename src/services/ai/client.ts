import type { z } from 'zod';

import {
  LIMITS,
  evaluateRequest,
  evaluateResponse,
  extractRequest,
  extractResponse,
  generateCardRequest,
  generateCardResponse,
  generateCardsRequest,
  generateCardsResponse,
  generatePracticeRequest,
  generatePracticeResponse,
  errorBody,
  type CardSuggestion,
  type EvaluateRequest,
  type Evaluation,
  type ExtractRequest,
  type ExtractedCandidate,
  type GenerateCardRequest,
  type GenerateCardsRequest,
  type GenerateCardsResponse,
  type GeneratePracticeRequest,
  type PracticeTask,
} from '../../../supabase/functions/_shared/contracts';
import { excerptInSource, termInSentence } from '../../../supabase/functions/_shared/verify';
import { AiError } from './errors';

/** Provider-agnostic surface the UI depends on. */
export interface AiService {
  readonly configured: boolean;
  generateCard(req: GenerateCardRequest): Promise<CardSuggestion>;
  generateCards(req: GenerateCardsRequest): Promise<GenerateCardsResponse['results']>;
  extractVocabulary(req: ExtractRequest): Promise<ExtractedCandidate[]>;
  generatePractice(req: GeneratePracticeRequest): Promise<PracticeTask>;
  evaluateWriting(req: EvaluateRequest): Promise<Evaluation>;
}

export interface HttpAiConfig {
  /** e.g. https://<ref>.supabase.co/functions/v1 */
  functionsUrl: string;
  /** Public (publishable) key only. Never a provider key or service-role key. */
  publishableKey: string;
  getAccessToken: () => Promise<string>;
  /** Called after a 401 so the next getAccessToken() fetches a fresh session. */
  invalidateToken?: () => Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const res = schema.safeParse(value);
  if (!res.success) {
    const tooLong = res.error.issues.some((i) => i.code === 'too_big');
    throw new AiError(tooLong ? 'too_large' : 'bad_request', res.error.issues[0]?.message);
  }
  return res.data;
}

const RETRYABLE: ReadonlySet<string> = new Set(['timeout', 'offline', 'provider_error', 'server_error']);

export function createHttpAiService(cfg: HttpAiConfig): AiService {
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 30_000;
  const retryDelayMs = cfg.retryDelayMs ?? 700;

  async function once(path: string, body: unknown, refreshed: boolean): Promise<unknown> {
    const token = await cfg.getAccessToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${cfg.functionsUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.publishableKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw new AiError('timeout');
      throw new AiError('offline');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      if (!refreshed && cfg.invalidateToken) {
        await cfg.invalidateToken();
        return once(path, body, true);
      }
      throw new AiError('unauthorized');
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After'));
      throw new AiError('rate_limited', undefined, Number.isFinite(ra) && ra > 0 ? ra : undefined);
    }
    if (res.status === 413) throw new AiError('too_large');

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new AiError(res.ok ? 'invalid_response' : 'server_error');
    }
    if (!res.ok) {
      const parsed = errorBody.safeParse(json);
      if (parsed.success) throw new AiError(parsed.data.error.code, undefined, parsed.data.error.retryAfterSeconds);
      throw new AiError(res.status >= 500 ? 'server_error' : 'bad_request');
    }
    return json;
  }

  async function call<S extends z.ZodType>(path: string, body: unknown, response: S): Promise<z.output<S>> {
    let json: unknown;
    try {
      json = await once(path, body, false);
    } catch (e) {
      // One bounded retry for transient failures; generation has no side effects, so it is safe.
      if (e instanceof AiError && RETRYABLE.has(e.code)) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        json = await once(path, body, false);
      } else {
        throw e;
      }
    }
    const parsed = response.safeParse(json);
    if (!parsed.success) throw new AiError('invalid_response');
    return parsed.data;
  }

  return {
    configured: true,
    async generateCard(req) {
      const body = parseInput(generateCardRequest, req);
      return (await call('generate-card', body, generateCardResponse)).card;
    },
    async generateCards(req) {
      const body = parseInput(generateCardsRequest, req);
      return (await call('generate-card', body, generateCardsResponse)).results;
    },
    async extractVocabulary(req) {
      const body = parseInput(extractRequest, req);
      const { candidates } = await call('extract-vocabulary', body, extractResponse);
      // Defence in depth: never trust a "verified" flag from the network for what we persist.
      return candidates.map((c) => {
        const ok = c.sourceSentence !== null && excerptInSource(body.text, c.sourceSentence) && termInSentence(c.term, c.sourceSentence);
        return { ...c, sourceVerified: ok, sourceSentence: ok ? c.sourceSentence : null };
      });
    },
    async generatePractice(req) {
      const body = parseInput(generatePracticeRequest, req);
      return (await call('generate-practice', body, generatePracticeResponse)).task;
    },
    async evaluateWriting(req) {
      const body = parseInput(evaluateRequest, req);
      return (await call('evaluate-writing', body, evaluateResponse)).evaluation;
    },
  };
}

/** Used when no backend is configured: every call fails honestly; nothing is faked. */
export function createUnconfiguredAiService(): AiService {
  const fail = () => Promise.reject(new AiError('not_configured'));
  return {
    configured: false,
    generateCard: fail,
    generateCards: fail,
    extractVocabulary: fail,
    generatePractice: fail,
    evaluateWriting: fail,
  };
}

export { LIMITS };
