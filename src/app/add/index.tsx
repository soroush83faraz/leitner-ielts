import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ICON_ENTER, Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { isAiConfigured } from '@/services/ai';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

const METHODS: { href: '/add/manual' | '/add/bulk' | '/add/from-text'; icon: IconName; title: string; body: string; ai?: string }[] = [
  { href: '/add/manual', icon: 'edit-2', title: 'افزودن دستی', body: 'یک واژه یا عبارت را با معنی و جمله‌ی خودتان بسازید.', ai: 'پیشنهاد کارت (اختیاری) با هوش مصنوعی' },
  { href: '/add/bulk', icon: 'list', title: 'فهرست چندتایی', body: 'هر خط یک واژه؛ یا «واژه، تب، معنی» برای فهرست آماده.', ai: 'تکمیل جزئیات دسته‌ای (اختیاری)' },
  { href: '/add/from-text', icon: 'file-text', title: 'استخراج از متن', body: 'یک متن انگلیسی بچسبانید تا واژه‌های مفید آیلتس پیشنهاد شوند.', ai: 'نیازمند هوش مصنوعی' },
];

export default function AddIndex() {
  const { colors } = useTheme();
  return (
    <Screen title="افزودن واژه" back>
      <Text tone="muted">هر روش را بخواهید انتخاب کنید. هیچ کارتی بدون پیش‌نمایش و تأیید شما ذخیره نمی‌شود.</Text>
      <View style={styles.list}>
        {METHODS.map((m) => {
          const needsAi = m.href === '/add/from-text';
          return (
            <Pressable
              key={m.href}
              onPress={() => router.push(m.href)}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}. ${m.body}`}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                <Icon name={m.icon} tone="primary" />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{m.title}</Text>
                <Text variant="caption" tone="muted">
                  {m.body}
                </Text>
                {m.ai ? (
                  <Text variant="caption" tone={needsAi && !isAiConfigured ? 'danger' : 'muted'}>
                    {needsAi && !isAiConfigured ? 'هوش مصنوعی تنظیم نشده؛ این روش فعلاً کار نمی‌کند.' : m.ai}
                  </Text>
                ) : null}
              </View>
              <Icon name={ICON_ENTER} tone="muted" />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, minHeight: MIN_TOUCH + 32 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
