import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** A single level of surface. Do not nest cards. */
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? space.lg : 0,
          gap: space.md,
          shadowColor: '#14262B',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: scheme === 'dark' ? 0 : 0.07,
          shadowRadius: 14,
          elevation: scheme === 'dark' ? 0 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
