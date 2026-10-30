import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'امروز', icon: 'sun' },
  { name: 'vocabulary', title: 'واژگان', icon: 'layers' },
  { name: 'practice', title: 'تمرین', icon: 'edit-3' },
  { name: 'progress', title: 'پیشرفت', icon: 'bar-chart-2' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 70 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarLabelPosition: 'below-icon',
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarLabel: ({ color }) => (
              <Text variant="caption" style={{ color, fontSize: 12, lineHeight: 18, flexShrink: 0 }} numberOfLines={1}>
                {t.title}
              </Text>
            ),
            tabBarIcon: ({ color }) => <Icon name={t.icon} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
