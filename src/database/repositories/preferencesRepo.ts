import { DEFAULT_PREFERENCES, preferencesSchema, type Preferences } from '@/features/settings/preferences';

import type { SqlDb } from '../types';

/** Rows hold JSON-encoded values; anything invalid falls back to its default. */
export async function loadPreferences(db: SqlDb): Promise<Preferences> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM user_preference');
  const raw: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      raw[r.key] = JSON.parse(r.value);
    } catch {
      // ignore corrupt value; default applies
    }
  }
  const strict = preferencesSchema.safeParse(raw);
  if (strict.success) return strict.data;
  // Per-key fallback so one bad value does not reset everything.
  const merged: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  for (const [k, v] of Object.entries(raw)) {
    if (preferencesSchema.safeParse({ ...merged, [k]: v }).success) merged[k] = v;
  }
  return preferencesSchema.parse(merged);
}

export async function savePreferences(db: SqlDb, patch: Partial<Preferences>): Promise<Preferences> {
  const next = preferencesSchema.parse({ ...(await loadPreferences(db)), ...patch });
  await db.transaction(async (tx) => {
    for (const [k, v] of Object.entries(next)) {
      await tx.run(
        'INSERT INTO user_preference (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [k, JSON.stringify(v)],
      );
    }
  });
  return next;
}
