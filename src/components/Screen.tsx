import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH, space } from '@/theme/tokens';

import { IconButton } from './Button';
import { ICON_BACK } from './Icon';
import { Text } from './Text';

export interface ScreenProps {
  title?: string;
  /** Shows a back button (for screens pushed on the stack). */
  back?: boolean | (() => void);
  right?: ReactNode;
  children: ReactNode;
  /** Non-scrolling layout (e.g. review). */
  fixed?: boolean;
  /** Content pinned under the scroll area (primary action bars). */
  footer?: ReactNode;
  /** Extra bottom padding when a tab bar sits below. */
  tabbed?: boolean;
}

export function Screen({ title, back, right, children, fixed, footer, tabbed }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hasHeader = !!(title || back || right);

  const goBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));

  const content = (
    <View style={[styles.column, fixed && styles.flex, { paddingBottom: fixed ? space.lg : space.xxxl }]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {hasHeader && (
        <View style={styles.headerWrap}>
          <View style={styles.header}>
            {back ? <IconButton icon={ICON_BACK} label="بازگشت" onPress={goBack} /> : null}
            <Text variant="title" style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            <View style={styles.right}>{right}</View>
          </View>
        </View>
      )}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {fixed ? (
          <View style={[styles.flex, styles.centerWrap]}>{content}</View>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.centerWrap, styles.grow, { paddingBottom: tabbed ? space.xl : insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {content}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      {footer ? (
        <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centerWrap: { alignItems: 'center' },
  grow: { flexGrow: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, paddingHorizontal: space.lg, gap: space.lg, flexGrow: 1 },
  headerWrap: { alignItems: 'center', width: '100%' },
  header: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
    minHeight: 60,
  },
  title: { flex: 1, paddingHorizontal: space.xs },
  right: { flexDirection: 'row', alignItems: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', paddingTop: space.md },
  footerInner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, paddingHorizontal: space.lg, gap: space.sm },
});
