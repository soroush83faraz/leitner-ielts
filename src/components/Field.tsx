import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, fonts, radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
  /** English input: LTR, left-aligned, no autocorrect surprises. */
  ltr?: boolean;
  lines?: number;
  counter?: { value: number; max: number };
}

/** Visible label above the input (never placeholder-only), hint below, error with icon + text. */
export function Field({ label, hint, error, ltr, lines, counter, multiline, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const isMulti = multiline || (lines ?? 1) > 1;
  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        multiline={isMulti}
        textAlignVertical={isMulti ? 'top' : 'center'}
        autoCapitalize={ltr ? 'none' : rest.autoCapitalize}
        autoCorrect={ltr ? false : rest.autoCorrect}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
            borderWidth: focused || error ? 2 : 1.5,
            fontFamily: ltr ? fonts.fa.regular : fonts.fa.regular,
            minHeight: isMulti ? 28 * (lines ?? 3) + 24 : MIN_TOUCH + 4,
            writingDirection: ltr ? 'ltr' : 'rtl',
            textAlign: ltr ? 'left' : 'right',
          },
        ]}
      />
      <View style={styles.meta}>
        <View style={styles.flex}>
          {error ? (
            <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Icon name="alert-triangle" size="sm" tone="danger" />
              <Text variant="caption" tone="danger" style={styles.flex}>
                {error}
              </Text>
            </View>
          ) : hint ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        {counter ? (
          <Text variant="caption" tone={counter.value > counter.max ? 'danger' : 'muted'}>
            {counter.value}/{counter.max}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  flex: { flex: 1 },
  input: { borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: 16, lineHeight: 24 },
  meta: { flexDirection: 'row', gap: space.sm, minHeight: 4 },
  errorRow: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
});
