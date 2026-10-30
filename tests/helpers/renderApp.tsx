import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { DEFAULT_PREFERENCES, type Preferences } from '@/features/settings/preferences';
import { AppContext, type AppContextValue } from '@/state/AppProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { freshDb, type NodeSqlDb } from './nodeSqliteDb';

export interface Harness {
  db: NodeSqlDb;
  ctx: AppContextValue;
  bumps: { count: number };
}

export async function makeHarness(prefs: Partial<Preferences> = {}, nowIso = '2026-03-10T09:00:00.000Z'): Promise<Harness> {
  const db = await freshDb();
  const bumps = { count: 0 };
  const ctx: AppContextValue = {
    db,
    prefs: { ...DEFAULT_PREFERENCES, ...prefs },
    updatePrefs: async () => undefined,
    version: 0,
    bump: () => void (bumps.count += 1),
    timeZone: 'UTC',
    now: () => nowIso,
  };
  return { db, ctx, bumps };
}

export function renderWithApp(ui: ReactElement, h: Harness) {
  return render(
    <AppContext.Provider value={h.ctx}>
      <ThemeProvider preference="light">{ui}</ThemeProvider>
    </AppContext.Provider>,
  );
}
