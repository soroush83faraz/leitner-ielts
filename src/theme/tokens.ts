/**
 * Design tokens. World: a paper flashcard box. Warm paper surfaces, deep teal
 * ink, one saffron accent. Box colours run from terracotta (fresh, fragile) to
 * deep teal (settled) and are always paired with a number, never colour alone.
 */
import type { BoxNumber } from '@/constants/leitner';

export interface Palette {
  bg: string;
  surface: string;
  sunken: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  accentSoft: string;
  onAccentSoft: string;
  success: string;
  successSoft: string;
  onSuccessSoft: string;
  danger: string;
  dangerSoft: string;
  onDangerSoft: string;
  hero: string;
  onHero: string;
  heroMuted: string;
  heroEdge: string;
  scrim: string;
  box: Record<BoxNumber, string>;
}

export const lightPalette: Palette = {
  bg: '#F4EFE6',
  surface: '#FFFCF6',
  sunken: '#EBE4D6',
  border: '#D3C8B3',
  text: '#14262B',
  textMuted: '#4C5D60',
  primary: '#0E4D57',
  onPrimary: '#FFF9EE',
  primarySoft: '#D5E6E4',
  onPrimarySoft: '#0A3A42',
  accent: '#D9931A',
  accentSoft: '#F5E3B6',
  onAccentSoft: '#5B3A00',
  success: '#1F7A45',
  successSoft: '#DCEBDD',
  onSuccessSoft: '#14532D',
  danger: '#B03A28',
  dangerSoft: '#F6DDD6',
  onDangerSoft: '#7A2416',
  hero: '#0E4D57',
  onHero: '#FFF9EE',
  heroMuted: '#BFDCDC',
  heroEdge: '#1D6A76',
  scrim: 'rgba(20,38,43,0.55)',
  box: { 1: '#C4572F', 2: '#B67A0E', 3: '#6B8F3F', 4: '#2F8F8F', 5: '#0E4D57' },
};

export const darkPalette: Palette = {
  bg: '#0D1B1E',
  surface: '#14282C',
  sunken: '#0A1517',
  border: '#34505A',
  text: '#EEF1EA',
  textMuted: '#A9BBBA',
  primary: '#5FC3CC',
  onPrimary: '#062428',
  primarySoft: '#1B3B41',
  onPrimarySoft: '#BFE8EC',
  accent: '#F0B650',
  accentSoft: '#3A2F14',
  onAccentSoft: '#F5D79A',
  success: '#6FCB91',
  successSoft: '#173626',
  onSuccessSoft: '#B5E8C9',
  danger: '#F3907A',
  dangerSoft: '#412019',
  onDangerSoft: '#F9C5B8',
  hero: '#17464E',
  onHero: '#F4F7F1',
  heroMuted: '#B7D3D5',
  heroEdge: '#2A6670',
  scrim: 'rgba(0,0,0,0.65)',
  box: { 1: '#E5805B', 2: '#EBAE3F', 3: '#9CC46F', 4: '#55B5B5', 5: '#7FD0D8' },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const MIN_TOUCH = 48;

export const fonts = {
  fa: { regular: 'Vazirmatn_400Regular', medium: 'Vazirmatn_500Medium', semibold: 'Vazirmatn_600SemiBold', bold: 'Vazirmatn_700Bold' },
  en: { regular: 'Newsreader_400Regular', medium: 'Newsreader_500Medium', semibold: 'Newsreader_600SemiBold', italic: 'Newsreader_400Regular_Italic' },
} as const;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';

/** Persian line-heights are taller than Latin ones; sizes are for Persian, English scales slightly up. */
export const typeScale: Record<TextVariant, { size: number; line: number; weight: 'regular' | 'medium' | 'semibold' | 'bold' }> = {
  display: { size: 30, line: 46, weight: 'bold' },
  title: { size: 24, line: 38, weight: 'bold' },
  heading: { size: 18, line: 30, weight: 'semibold' },
  body: { size: 16, line: 27, weight: 'regular' },
  bodyStrong: { size: 16, line: 27, weight: 'medium' },
  label: { size: 14, line: 22, weight: 'medium' },
  caption: { size: 13, line: 21, weight: 'regular' },
};

export const MAX_CONTENT_WIDTH = 640;
