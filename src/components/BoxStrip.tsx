import { Pressable, StyleSheet, View } from 'react-native';

import { BOX_INTERVAL_DAYS, BOX_NUMBERS, type BoxNumber } from '@/constants/leitner';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toPersianDigits } from '@/utils/text';

import { Text } from './Text';

const STACK = 4;

/**
 * The five Leitner boxes as compact card-box tiles: a colour tab, the count in text,
 * and a little stack of cards whose height follows the share of words. Nothing depends on colour alone.
 */
export function BoxStrip({
  counts,
  selected,
  onSelect,
  compact,
}: {
  counts: Record<BoxNumber, number>;
  selected?: BoxNumber | null;
  onSelect?: (box: BoxNumber) => void;
  /** Smaller tiles without the card stack (used above long lists). */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const max = Math.max(1, ...BOX_NUMBERS.map((b) => counts[b]));
  return (
    <View style={styles.row} accessibilityRole="summary">
      {BOX_NUMBERS.map((b) => {
        const n = counts[b];
        const filled = n === 0 ? 0 : Math.max(1, Math.round((n / max) * STACK));
        const active = selected === b;
        return (
          <Pressable
            key={b}
            disabled={!onSelect}
            onPress={() => onSelect?.(b)}
            accessibilityRole={onSelect ? 'button' : 'text'}
            accessibilityState={{ selected: active }}
            accessibilityLabel={`جعبه ${toPersianDigits(b)}، ${toPersianDigits(n)} واژه، مرور بعد از ${toPersianDigits(BOX_INTERVAL_DAYS[b])} روز`}
            style={({ pressed }) => [
              styles.box,
              {
                backgroundColor: active ? colors.primarySoft : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderWidth: active ? 2 : 1,
                opacity: pressed ? 0.85 : 1,
                paddingVertical: compact ? space.sm : space.md,
              },
            ]}
          >
            <Text variant="caption" tone="muted" center>
              جعبه {toPersianDigits(b)}
            </Text>
            <Text variant="title" center style={compact ? styles.countSm : styles.count}>
              {toPersianDigits(n)}
            </Text>
            {compact ? null : <View style={styles.stack}>
              {Array.from({ length: STACK }, (_, i) => (
                <View key={i} style={[styles.card, { backgroundColor: i < filled ? colors.box[b] : colors.sunken }]} />
              ))}
            </View>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  box: { flex: 1, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.xs, alignItems: 'center', gap: 2 },
  count: { fontSize: 22, lineHeight: 32 },
  countSm: { fontSize: 18, lineHeight: 26 },
  stack: { flexDirection: 'column-reverse', gap: 3, width: '60%', marginTop: space.xs },
  card: { height: 4, borderRadius: 2 },
});
