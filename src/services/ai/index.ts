import * as SecureStore from 'expo-secure-store';

import { createAnonymousAuth, type SessionStore, type StoredSession } from './anonymousAuth';
import { createHttpAiService, createUnconfiguredAiService, type AiService } from './client';

export { AiError, describeAiError, isRetryableAiError } from './errors';
export type { AiService } from './client';

// Expo inlines EXPO_PUBLIC_* at build time. Only the PUBLIC URL and PUBLISHABLE
// (anon) key belong here; provider API keys live in Edge Function secrets.
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const isAiConfigured = SUPABASE_URL.startsWith('https://') && PUBLISHABLE_KEY.length > 20;

const SESSION_KEY = 'ai_session_v1';

const secureStore: SessionStore = {
  async load() {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },
  async save(s) {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s));
    } catch {
      // Storage unavailable: the session just won't persist across launches.
    }
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // ignore
    }
  },
};

function build(): AiService {
  if (!isAiConfigured) return createUnconfiguredAiService();
  const auth = createAnonymousAuth({ supabaseUrl: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY, store: secureStore });
  return createHttpAiService({
    functionsUrl: `${SUPABASE_URL}/functions/v1`,
    publishableKey: PUBLISHABLE_KEY,
    getAccessToken: () => auth.getAccessToken(),
    invalidateToken: () => auth.invalidate(),
  });
}

export const aiService: AiService = build();
