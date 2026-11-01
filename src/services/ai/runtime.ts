import { useSyncExternalStore } from 'react';

import { createByokAiService, validateByokConfig, type ByokConfig, type ByokProvider } from './byok';
import { createUnconfiguredAiService, type AiService } from './client';
import { AiError } from './errors';
import { deleteSecret, readSecret, writeSecret } from './secretStore';

/**
 * Which AI backend is active:
 *  - `own-key`: the learner connected their own provider key (device-only, direct calls)
 *  - `server`: the app's Supabase gateway (only when the build was configured with one)
 *  - `none`: no AI; everything else keeps working
 * Their own key wins over the server.
 */
export type AiMode = 'none' | 'own-key' | 'server';

interface State {
  mode: AiMode;
  service: AiService;
  /** Non-secret summary for the settings screen. */
  own: { provider: ByokProvider; model: string; keyHint: string } | null;
}

let serverService: AiService | null = null;
let state: State = { mode: 'none', service: createUnconfiguredAiService(), own: null };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function fallback(): State {
  return serverService ? { mode: 'server', service: serverService, own: null } : { mode: 'none', service: createUnconfiguredAiService(), own: null };
}

/** Called once from index.ts with the server-backed service, if this build has one. */
export function registerServerService(s: AiService | null) {
  serverService = s;
  if (state.mode !== 'own-key') set(fallback());
}

function activate(cfg: ByokConfig) {
  set({
    mode: 'own-key',
    service: createByokAiService(cfg),
    own: { provider: cfg.provider, model: cfg.model, keyHint: `••••${cfg.apiKey.trim().slice(-4)}` },
  });
}

/** Loads a previously saved key at app start. Corrupt data is ignored, never fatal. */
export async function loadSavedKey(): Promise<void> {
  const raw = await readSecret();
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw) as ByokConfig;
    if (!validateByokConfig(cfg)) activate(cfg);
  } catch {
    // ignore: user can re-enter the key
  }
}

/** Persists and activates a key the caller has already tested. */
export async function saveOwnKey(cfg: ByokConfig): Promise<void> {
  const problem = validateByokConfig(cfg);
  if (problem) throw new AiError('bad_request', problem);
  if (!(await writeSecret(JSON.stringify(cfg)))) throw new AiError('server_error', 'secure storage unavailable');
  activate(cfg);
}

export async function clearOwnKey(): Promise<void> {
  await deleteSecret();
  set(fallback());
}

/** Stable object the whole app imports; it always forwards to whichever backend is active. */
export const aiService: AiService = {
  get configured() {
    return state.mode !== 'none';
  },
  generateCard: (r) => state.service.generateCard(r),
  generateCards: (r) => state.service.generateCards(r),
  extractVocabulary: (r) => state.service.extractVocabulary(r),
  generatePractice: (r) => state.service.generatePractice(r),
  evaluateWriting: (r) => state.service.evaluateWriting(r),
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function getAiMode(): AiMode {
  return state.mode;
}

export function useAiMode(): AiMode {
  return useSyncExternalStore(subscribe, () => state.mode, () => state.mode);
}

export function useAiConfigured(): boolean {
  return useAiMode() !== 'none';
}

export function useOwnKeySummary(): State['own'] {
  return useSyncExternalStore(subscribe, () => state.own, () => state.own);
}
