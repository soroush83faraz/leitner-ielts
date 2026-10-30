import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { Preferences } from '@/features/settings/preferences';

import { darkPalette, lightPalette, type Palette } from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
}

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: lightPalette });

export function ThemeProvider({ preference, children }: { preference: Preferences['theme']; children: ReactNode }) {
  const system = useColorScheme();
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo<Theme>(() => ({ scheme, colors: scheme === 'dark' ? darkPalette : lightPalette }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
