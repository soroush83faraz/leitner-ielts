import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type StateKind = 'loading' | 'empty' | 'error' | 'offline';

const ICONS: Record<Exclude<StateKind, 'loading'>, IconName> = { empty: 'inbox', error: 'alert-triangle', offline: 'wifi-off' };

/** Loading / empty / error / offline, always with a way forward. */
export function StateView({
  kind,
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  kind: StateKind;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      {kind === 'loading' ? (
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="در حال بارگذاری" />
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: kind === 'error' ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name={ICONS[kind]} size="lg" tone={kind === 'error' ? 'danger' : 'primary'} />
        </View>
      )}
      {title ? (
        <Text variant="heading" center>
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text tone="muted" center>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} block={false} /> : null}
      {secondaryLabel && onSecondary ? <Button label={secondaryLabel} onPress={onSecondary} variant="quiet" block={false} /> : null}
    </View>
  );
}

export function Banner({
  kind,
  text,
  actionLabel,
  onAction,
}: {
  kind: 'info' | 'warn' | 'danger' | 'success';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.primarySoft, fg: colors.onPrimarySoft, icon: 'info' as IconName },
    warn: { bg: colors.accentSoft, fg: colors.onAccentSoft, icon: 'alert-triangle' as IconName },
    danger: { bg: colors.dangerSoft, fg: colors.onDangerSoft, icon: 'alert-triangle' as IconName },
    success: { bg: colors.successSoft, fg: colors.onSuccessSoft, icon: 'check-circle' as IconName },
  }[kind];
  return (
    <View
      style={[styles.banner, { backgroundColor: map.bg }]}
      accessibilityRole={kind === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon name={map.icon} size="md" color={map.fg} />
      <View style={styles.flex}>
        <Text variant="label" style={{ color: map.fg, fontFamily: undefined }}>
          {text}
        </Text>
        {actionLabel && onAction ? (
          <Button label={actionLabel} onPress={onAction} variant="quiet" block={false} style={styles.bannerAction} />
        ) : null}
      </View>
    </View>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const { colors } = useTheme();
  const pct = max <= 0 ? 0 : Math.min(1, value / max);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
      style={[styles.track, { backgroundColor: colors.sunken }]}
    >
      <View style={[styles.fill, { backgroundColor: colors.primary, width: `${pct * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, alignItems: 'flex-start' },
  flex: { flex: 1 },
  bannerAction: { minHeight: 40, paddingHorizontal: 0, alignSelf: 'flex-start' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
