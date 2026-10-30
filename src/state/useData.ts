import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { SqlDb } from '@/database/types';

import { useApp } from './AppProvider';

export interface DataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload(): void;
}

interface Ctx {
  db: SqlDb;
  nowIso: string;
  timeZone: string;
}

/**
 * Loads data whenever the screen gains focus or any write bumps the app version.
 * Late responses from superseded loads are discarded.
 */
export function useData<T>(loader: (ctx: Ctx) => Promise<T>, deps: readonly unknown[] = []): DataState<T> {
  const { db, version, now, timeZone } = useApp();
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const depsKey = JSON.stringify(deps);
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const mine = ++seq.current;
      setState((s) => ({ ...s, loading: s.data === null, error: null }));
      loader({ db, nowIso: now(), timeZone })
        .then((data) => {
          if (mine === seq.current) setState({ data, loading: false, error: null });
        })
        .catch((e: unknown) => {
          if (mine === seq.current) setState((s) => ({ data: s.data, loading: false, error: e instanceof Error ? e.message : 'خطا' }));
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, version, tick, timeZone, depsKey]),
  );

  return { ...state, reload: () => setTick((t) => t + 1) };
}
