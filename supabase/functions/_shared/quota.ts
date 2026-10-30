import { adminClient } from './auth.ts';

export interface QuotaResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: 'ok' | 'minute' | 'day' | 'global';
}

function intEnv(name: string, fallback: number): number {
  const n = Number(Deno.env.get(name));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Per-user burst and daily limits plus a global daily ceiling, enforced atomically in Postgres. */
export async function consumeQuota(userId: string, weight = 1): Promise<QuotaResult> {
  const { data, error } = await adminClient().rpc('consume_ai_quota', {
    p_user: userId,
    p_weight: weight,
    p_minute_limit: intEnv('AI_LIMIT_PER_MINUTE', 12),
    p_day_limit: intEnv('AI_LIMIT_PER_DAY', 150),
    p_global_day_limit: intEnv('AI_LIMIT_GLOBAL_PER_DAY', 5000),
  });
  if (error || !data) throw new Error('quota_unavailable');
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: !!row.allowed, retryAfterSeconds: Number(row.retry_after ?? 0), reason: row.reason ?? 'ok' };
}
