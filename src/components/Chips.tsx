import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { BoxNumber } from '@/constants/leitner';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { toPersianDigits } from '@/utils/text';

import { Icon } from './Icon';
import { Text } from './Text';

export function Chip({ label, selected, onPress, count }: { label: string; selected?: boolean; onPress: () => void; count?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count !== undefined ? `${label}، ${toPersianDigits(count)}` : label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {selected ? <Icon name="check" size="sm" tone="onPrimary" /> : null}
      <Text variant="label" tone={selected ? 'onPrimary' : 'default'}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="caption" tone={selected ? 'onPrimary' : 'muted'}>
          {toPersianDigits(count)}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

/** A box marker: coloured dot plus the number, so the box is readable without colour. */
export function BoxBadge({ box }: { box: BoxNumber }) {
  const { colors } = useTheme();
  return (
    <View style={styles.badge} accessible accessibilityLabel={`جعبه ${toPersianDigits(box)}`}>
      <View style={[styles.dot, { backgroundColor: colors.box[box] }]} />
      <Text variant="caption" tone="muted">
        جعبه {toPersianDigits(box)}
      </Text>
    </View>
  );
}

export function Tag({ label, kind = 'neutral' }: { label: string; kind?: 'neutral' | 'warn' | 'good' | 'info' }) {
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.sunken, fg: colors.textMuted },
    warn: { bg: colors.accentSoft, fg: colors.onAccentSoft },
    good: { bg: colors.successSoft, fg: colors.onSuccessSoft },
    info: { bg: colors.primarySoft, fg: colors.onPrimarySoft },
  }[kind];
  return (
    <View style={[styles.tag, { backgroundColor: map.bg }]}>
      <Text variant="caption" style={{ color: map.fg }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs, paddingHorizontal: 2 },
  chip: {
    minHeight: MIN_TOUCH - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tag: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start' },
});
