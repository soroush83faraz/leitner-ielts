import { AiError } from './errors';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
}

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(s: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

interface AuthConfig {
  supabaseUrl: string;
  publishableKey: string;
  store: SessionStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
}

/**
 * Minimal Supabase anonymous-auth client (GoTrue REST). Gives each install its own
 * JWT so the Edge Functions can rate-limit per user. This is an abuse *throttle*,
 * not a strong identity: see README "Abuse protection".
 */
export function createAnonymousAuth(cfg: AuthConfig) {
  const doFetch = cfg.fetchImpl ?? fetch;
  const now = cfg.now ?? (() => Math.floor(Date.now() / 1000));
  let inflight: Promise<string> | null = null;

  async function post(path: string, body: unknown): Promise<StoredSession> {
    let res: Response;
    try {
      res = await doFetch(`${cfg.supabaseUrl}/auth/v1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.publishableKey },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AiError('offline');
    }
    if (!res.ok) throw new AiError(res.status === 429 ? 'rate_limited' : 'unauthorized');
    const j = (await res.json()) as TokenResponse;
    if (!j.access_token || !j.refresh_token) throw new AiError('unauthorized');
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: j.expires_at ?? now() + (j.expires_in ?? 3600),
    };
  }

  async function obtain(): Promise<string> {
    const stored = await cfg.store.load();
    if (stored && stored.expiresAt - 60 > now()) return stored.accessToken;
    let session: StoredSession | null = null;
    if (stored) {
      try {
        session = await post('token?grant_type=refresh_token', { refresh_token: stored.refreshToken });
      } catch (e) {
        if (e instanceof AiError && e.code === 'offline') throw e;
        // refresh token rejected: fall through to a new anonymous session
      }
    }
    session ??= await post('signup', { data: {} });
    await cfg.store.save(session);
    return session.accessToken;
  }

  return {
    getAccessToken(): Promise<string> {
      inflight ??= obtain().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    async invalidate(): Promise<void> {
      const s = await cfg.store.load();
      if (s) await cfg.store.save({ ...s, expiresAt: 0 });
    },
  };
}
