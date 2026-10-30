import { authenticate } from './auth.ts';
import type { AiErrorCode } from './contracts.ts';
import { ProviderError } from './llm.ts';
import type { Operation } from './operations.ts';
import { getProvider } from './provider.ts';
import { consumeQuota } from './quota.ts';

const MAX_BODY_CHARS = 40_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
}

function fail(status: number, code: AiErrorCode, message: string, retryAfterSeconds?: number): Response {
  return respond(status, { error: { code, message, retryAfterSeconds } }, retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {});
}

/**
 * Wraps an Operation as an HTTP handler: method/size checks, auth, quota, validation,
 * one retry on unusable model output, safe errors. It never logs request content.
 */
export function serveOperation(op: Operation): (req: Request) => Promise<Response> {
  return async (req) => {
    const started = Date.now();
    const log = (status: number, extra: Record<string, unknown> = {}) =>
      console.log(JSON.stringify({ fn: op.name, status, ms: Date.now() - started, ...extra }));

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return fail(405, 'bad_request', 'method_not_allowed');

    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_CHARS * 4) return fail(413, 'too_large', 'payload_too_large');

    const caller = await authenticate(req).catch(() => null);
    if (!caller) {
      log(401);
      return fail(401, 'unauthorized', 'unauthorized');
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return fail(413, 'too_large', 'payload_too_large');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, 'bad_request', 'invalid_json');
    }

    const parsed = op.request.safeParse(body);
    if (!parsed.success) {
      const tooBig = parsed.error.issues.some((i) => i.code === 'too_big');
      return fail(tooBig ? 413 : 400, tooBig ? 'too_large' : 'bad_request', 'invalid_request');
    }

    try {
      const quota = await consumeQuota(caller.userId, op.weight(parsed.data));
      if (!quota.allowed) {
        log(429, { reason: quota.reason });
        return fail(429, 'rate_limited', 'rate_limited', Math.max(1, quota.retryAfterSeconds));
      }
    } catch {
      // If the limiter itself is down we fail closed: an unmetered AI endpoint is an abuse risk.
      log(503, { reason: 'quota_unavailable' });
      return fail(503, 'server_error', 'quota_unavailable');
    }

    let provider;
    try {
      provider = getProvider();
    } catch {
      log(503, { reason: 'not_configured' });
      return fail(503, 'not_configured', 'ai_not_configured');
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await op.run(parsed.data, provider);
        const checked = op.response.safeParse(result);
        if (!checked.success) throw new ProviderError('invalid_output');
        log(200, { attempt });
        return respond(200, checked.data);
      } catch (e) {
        const kind = e instanceof ProviderError ? e.kind : 'invalid_output'; // schema failures are unusable output
        if (kind === 'timeout') return fail(504, 'timeout', 'timeout');
        if (kind === 'rate_limited') return fail(503, 'provider_error', 'provider_busy', 10);
        if (kind === 'provider_error' || kind === 'not_configured') return fail(502, 'provider_error', 'provider_error');
        if (attempt === 2) {
          log(502, { reason: 'invalid_output' });
          return fail(502, 'invalid_response', 'invalid_model_output');
        }
      }
    }
    return fail(500, 'server_error', 'unexpected');
  };
}
