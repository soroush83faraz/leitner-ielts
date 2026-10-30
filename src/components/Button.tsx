import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'success' | 'inverse';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (default true). */
  block?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  compact?: boolean;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, block = true, hint, style, testID, compact }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
    quiet: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.onDangerSoft, border: colors.danger },
    success: { bg: colors.successSoft, fg: colors.onSuccessSoft, border: colors.success },
    inverse: { bg: colors.onHero, fg: colors.hero, border: colors.onHero },
  }[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : pressed ? 0.82 : 1,
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} color={palette.fg} /> : null}
        <Text variant="bodyStrong" style={{ color: palette.fg }} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'default',
  disabled,
}: {
  icon: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  onPress: () => void;
  tone?: 'default' | 'muted' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.icon, { backgroundColor: pressed ? colors.sunken : 'transparent', opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon name={icon} tone={tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compact: { minHeight: MIN_TOUCH, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
