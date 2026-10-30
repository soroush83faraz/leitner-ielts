import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type IconName = ComponentProps<typeof Feather>['name'];

/** One icon family (Feather, outline, 2px stroke) at two sizes. Decorative by default. */
export const ICON_SIZE = { sm: 18, md: 22, lg: 28 } as const;

/** The app is RTL: "back" points right, "go in" points left. */
export const ICON_BACK: IconName = 'arrow-right';
export const ICON_ENTER: IconName = 'chevron-left';

export function Icon({
  name,
  size = 'md',
  color,
  tone,
}: {
  name: IconName;
  size?: keyof typeof ICON_SIZE;
  color?: ColorValue;
  tone?: 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'onPrimary';
}) {
  const { colors } = useTheme();
  const map = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
    onPrimary: colors.onPrimary,
  } as const;
  return (
    <Feather
      name={name}
      size={ICON_SIZE[size]}
      color={(color ?? map[tone ?? 'default']) as string}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
