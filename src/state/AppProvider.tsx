import * as SQLite from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ExpoSqlDb } from '@/database/expoSqlDb';
import { runMigrations } from '@/database/migrations';
import { loadPreferences, savePreferences } from '@/database/repositories/preferencesRepo';
import type { SqlDb } from '@/database/types';
import { DEFAULT_PREFERENCES, type Preferences } from '@/features/settings/preferences';
import { deviceTimeZone } from '@/utils/dates';

import { StateView } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { ThemeProvider } from '@/theme/ThemeProvider';

const DB_NAME = 'leitner-ielts.db';

/** Module-level so its identity never changes: effects may depend on it without re-running. */
const nowIso = () => new Date().toISOString();

export interface AppContextValue {
  db: SqlDb;
  prefs: Preferences;
  updatePrefs(patch: Partial<Preferences>): Promise<void>;
  /** Incremented after any write that screens may need to re-read. */
  version: number;
  bump(): void;
  timeZone: string;
  now(): string;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

/** Opens the database and applies migrations. A failure leaves the file untouched and is retryable. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SqlDb | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useMemo(() => deviceTimeZone(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SQLite.openDatabaseAsync(DB_NAME);
        await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
        const sql = ExpoSqlDb.from(raw);
        await runMigrations(sql);
        const p = await loadPreferences(sql);
        if (cancelled) return;
        setPrefs(p);
        setDb(sql);
      } catch (e) {
        // Diagnostic only: error text from SQLite, never user content.
        console.warn('[db] open/migrate failed:', e instanceof Error ? e.message : e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const updatePrefs = useCallback(
    async (patch: Partial<Preferences>) => {
      if (!db) return;
      const next = await savePreferences(db, patch);
      setPrefs(next);
      bump();
    },
    [db, bump],
  );

  const value = useMemo<AppContextValue | null>(
    () => (db ? { db, prefs, updatePrefs, version, bump, timeZone, now: nowIso } : null),
    [db, prefs, updatePrefs, version, bump, timeZone],
  );

  if (!value) {
    return (
      <ThemeProvider preference="system">
        <BootView
          error={error}
          retry={() => {
            setError(null);
            setAttempt((a) => a + 1);
          }}
        />
      </ThemeProvider>
    );
  }
  return (
    <AppContext.Provider value={value}>
      <ThemeProvider preference={prefs.theme}>{children}</ThemeProvider>
    </AppContext.Provider>
  );
}

/** Shown while the database opens, or if opening/migrating failed (existing data is never wiped). */
function BootView({ error, retry }: { error: string | null; retry(): void }) {
  return (
    <Screen fixed>
      {error ? (
        <StateView
          kind="error"
          title="باز کردن پایگاه داده ممکن نشد"
          message="داده‌های ذخیره‌شده‌ی شما دست‌نخورده مانده است. دوباره تلاش کنید؛ اگر مشکل ادامه داشت، برنامه را ببندید و دوباره باز کنید."
          actionLabel="تلاش دوباره"
          onAction={retry}
        />
      ) : (
        <StateView kind="loading" title="در حال آماده‌سازی…" />
      )}
    </Screen>
  );
}
