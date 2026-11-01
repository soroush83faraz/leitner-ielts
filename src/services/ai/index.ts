import * as SecureStore from 'expo-secure-store';

import { createAnonymousAuth, type SessionStore, type StoredSession } from './anonymousAuth';
import { createHttpAiService } from './client';
import { registerServerService } from './runtime';

export { AiError, describeAiError, isRetryableAiError } from './errors';
export type { AiService } from './client';
export { aiService, clearOwnKey, getAiMode, loadSavedKey, saveOwnKey, useAiConfigured, useAiMode, useOwnKeySummary } from './runtime';
export { BYOK_DEFAULTS, testByokConnection, validateByokConfig, type ByokConfig, type ByokProvider } from './byok';

// Expo inlines EXPO_PUBLIC_* at build time. Only the PUBLIC URL and PUBLISHABLE (anon) key belong
// here; a developer's provider key lives in Edge Function secrets. A learner's own key is entered at
// runtime and kept on their device (see secretStore.ts), never in the build.
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const serverConfigured = SUPABASE_URL.startsWith('https://') && PUBLISHABLE_KEY.length > 20;

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

if (serverConfigured) {
  const auth = createAnonymousAuth({ supabaseUrl: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY, store: secureStore });
  registerServerService(
    createHttpAiService({
      functionsUrl: `${SUPABASE_URL}/functions/v1`,
      publishableKey: PUBLISHABLE_KEY,
      getAccessToken: () => auth.getAccessToken(),
      invalidateToken: () => auth.invalidate(),
    }),
  );
}
