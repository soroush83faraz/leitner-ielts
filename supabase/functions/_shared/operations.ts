/**
 * The four AI operations as pure(ish) functions of (validated request, provider).
 * No Deno APIs here, so the app's Jest suite exercises them with a fake provider.
 */
import type { z } from 'zod';

import {
  cardSuggestion,
  evaluateRequest,
  evaluateResponse,
  evaluation,
  extractRequest,
  extractResponse,
  generateCardRequest,
  generateCardResponse,
  generateCardsRequest,
  generateCardsResponse,
  generatePracticeRequest,
  generatePracticeResponse,
  modelExtraction,
  practiceTask,
} from './contracts.ts';
import type { LlmProvider } from './llm.ts';
import { cardBatchItemPrompt, cardPrompt, evaluatePrompt, extractPrompt, practicePrompt, type Prompt } from './prompts.ts';
import { excerptInSource, verifyCandidates } from './verify.ts';

const TIMEOUT_MS = 40_000;

export interface Operation {
  name: string;
  /** What the HTTP handler validates the body against. */
  request: z.ZodType<unknown>;
  /** What the HTTP handler validates the result against before replying. */
  response: z.ZodType<unknown>;
  /** Quota units this request consumes. */
  weight(req: unknown): number;
  run(req: unknown, provider: LlmProvider): Promise<unknown>;
}

const call = (provider: LlmProvider, p: Prompt) =>
  provider.completeJson({ system: p.system, user: p.user, maxTokens: p.maxTokens, timeoutMs: TIMEOUT_MS });

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export const generateCardOp: Operation = {
  name: 'generate-card',
  request: generateCardRequest.or(generateCardsRequest),
  response: generateCardResponse.or(generateCardsResponse),
  weight: (r) => ('items' in (r as object) ? (r as z.output<typeof generateCardsRequest>).items.length : 1),
  async run(raw, provider) {
    if (typeof raw === 'object' && raw !== null && 'items' in raw) {
      const req = generateCardsRequest.parse(raw);
      // Per-item isolation: one bad generation never fails the others.
      const results = await mapLimit(req.items, 3, async (item) => {
        try {
          const out = generateCardResponse.parse(await call(provider, cardBatchItemPrompt(item.term, item.meaningFa, req.level)));
          return { ok: true as const, term: item.term, card: { ...out.card, term: item.term } };
        } catch {
          return { ok: false as const, term: item.term, error: 'generation_failed' };
        }
      });
      return { results };
    }
    const req = generateCardRequest.parse(raw);
    const out = generateCardResponse.parse(await call(provider, cardPrompt(req)));
    return { card: { ...out.card, term: req.term } };
  },
};

export const extractOp: Operation = {
  name: 'extract-vocabulary',
  request: extractRequest,
  response: extractResponse,
  weight: () => 3,
  async run(raw, provider) {
    const req = extractRequest.parse(raw);
    const modelOut = modelExtraction.parse(await call(provider, extractPrompt(req)));
    return { candidates: verifyCandidates(req.text, modelOut.candidates, req.maxCandidates) };
  },
};

export const practiceOp: Operation = {
  name: 'generate-practice',
  request: generatePracticeRequest,
  response: generatePracticeResponse,
  weight: () => 2,
  async run(raw, provider) {
    const req = generatePracticeRequest.parse(raw);
    const json = (await call(provider, practicePrompt(req))) as { task?: unknown };
    const task = practiceTask.parse(json.task);
    if (task.skill !== req.skill) throw new Error('wrong_skill');
    return { task };
  },
};

export const evaluateOp: Operation = {
  name: 'evaluate-writing',
  request: evaluateRequest,
  response: evaluateResponse,
  weight: () => 2,
  async run(raw, provider) {
    const req = evaluateRequest.parse(raw);
    const json = (await call(provider, evaluatePrompt(req))) as { evaluation?: unknown };
    const ev = evaluation.parse(json.evaluation);
    return {
      evaluation: {
        ...ev,
        // A correction must quote the learner's real text; drop any that do not.
        issues: ev.issues.filter((i) => !i.original || excerptInSource(req.text, i.original)),
      },
    };
  },
};
