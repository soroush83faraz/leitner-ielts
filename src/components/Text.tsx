import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts, typeScale, type Palette, type TextVariant } from '@/theme/tokens';

export type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'onPrimary' | 'accent';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: Tone;
  center?: boolean;
}

function toneColor(c: Palette, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return c.textMuted;
    case 'primary':
      return c.primary;
    case 'danger':
      return c.danger;
    case 'success':
      return c.success;
    case 'onPrimary':
      return c.onPrimary;
    case 'accent':
      return c.onAccentSoft;
    default:
      return c.text;
  }
}

/** Persian (default) text. Direction follows the RTL layout. */
export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const t = typeScale[variant];
  const base: TextStyle = {
    fontFamily: fonts.fa[t.weight],
    fontSize: t.size,
    lineHeight: t.line,
    color: toneColor(colors, tone),
  };
  return <RNText {...rest} style={[base, center && { textAlign: 'center' }, style]} />;
}

export interface EnTextProps extends TextProps {
  /** Serif headword style used for English terms. */
  serif?: boolean;
  italic?: boolean;
  size?: number;
}

/**
 * English text: always left-to-right and left-aligned, even inside the RTL UI,
 * so words, IPA and example sentences never get reordered by the bidi algorithm.
 */
export function EnText({ variant = 'body', tone = 'default', serif, italic, size, center, style, ...rest }: EnTextProps) {
  const { colors } = useTheme();
  const t = typeScale[variant];
  const fontSize = size ?? (serif ? t.size + 2 : t.size);
  const base: TextStyle = {
    fontFamily: serif ? (italic ? fonts.en.italic : t.weight === 'regular' ? fonts.en.regular : fonts.en.semibold) : fonts.fa[t.weight],
    fontSize,
    lineHeight: Math.round(fontSize * 1.4),
    color: toneColor(colors, tone),
    writingDirection: 'ltr',
    textAlign: center ? 'center' : 'left',
    // Shrink-wrap to the start edge so English sits with the Persian text, not on the opposite side.
    ...(center ? null : { alignSelf: 'flex-start' as const }),
  };
  return <RNText {...rest} style={[base, style]} />;
}
