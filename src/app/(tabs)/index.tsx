import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BoxStrip } from '@/components/BoxStrip';
import { Button, IconButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, ProgressBar, StateView } from '@/components/Feedback';
import { ICON_ENTER, Icon } from '@/components/Icon';
import { Reveal } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { SKILL_BLURB_FA, SKILL_FA } from '@/features/practice/recommend';
import { loadToday } from '@/features/progress/today';
import { useApp } from '@/state/AppProvider';
import { useOnline } from '@/state/device';
import { useData } from '@/state/useData';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { longDateFa, relativeDayFa, weekdayInitialFa } from '@/utils/format';
import { toPersianDigits } from '@/utils/text';

export default function TodayScreen() {
  const { prefs, now, timeZone } = useApp();
  const { colors } = useTheme();
  const online = useOnline();
  const { data, error, reload } = useData((c) => loadToday(c.db, c.nowIso, c.timeZone, prefs), [prefs.dailyNewTarget]);

  const header = <IconButton icon="settings" label="تنظیمات" onPress={() => router.push('/settings')} />;

  if (!data) {
    return (
      <Screen title="امروز" right={header} tabbed>
        {error ? (
          <StateView kind="error" title="خواندن اطلاعات ممکن نشد" message={error} actionLabel="تلاش دوباره" onAction={reload} />
        ) : (
          <StateView kind="loading" />
        )}
      </Screen>
    );
  }

  const { due, totalWords } = data;
  const nowIso = now();

  const hero =
    totalWords === 0
      ? {
          title: 'با چند واژه شروع کنیم',
          body: 'هر واژه با جمله و معنی ذخیره می‌شود و در جعبه‌ی اول لایتنر می‌نشیند.',
          cta: { label: 'افزودن اولین واژه‌ها', icon: 'plus' as const, onPress: () => router.push('/add') },
        }
      : due.total > 0
        ? {
            title: `${toPersianDigits(due.total)} کارت منتظر مرور است`,
            body: [due.reviews > 0 && `${toPersianDigits(due.reviews)} مرور`, due.fresh > 0 && `${toPersianDigits(due.fresh)} واژه‌ی تازه`].filter(Boolean).join(' و ') + ' · ابتدا مرورها',
            cta: { label: 'شروع مرور', icon: 'play' as const, onPress: () => router.push('/review') },
          }
        : {
            title: 'برای الان مروری باقی نمانده',
            body: data.nextDueAt ? `مرور بعدی: ${relativeDayFa(data.nextDueAt, nowIso, timeZone)}` : 'می‌توانید واژه‌ی تازه اضافه کنید.',
            cta: { label: 'یک تمرین کوتاه', icon: 'edit-3' as const, onPress: () => router.push('/practice') },
          };

  return (
    <Screen title="امروز" right={header} tabbed>
      <Text tone="muted" style={styles.date}>
        {longDateFa(nowIso)}
      </Text>

      {online === false ? <Banner kind="info" text="آفلاین هستید. مرور و واژه‌های ذخیره‌شده کاملاً در دسترس‌اند." /> : null}

      <Reveal>
        <View style={styles.heroWrap}>
          <View style={[styles.peek, { backgroundColor: colors.heroEdge, left: 28, right: 28, bottom: 0, opacity: 0.55 }]} />
          <View style={[styles.peek, { backgroundColor: colors.heroEdge, left: 14, right: 14, bottom: 6, opacity: 0.9 }]} />
          <View style={[styles.hero, { backgroundColor: colors.hero }]}>
            <Text variant="title" accessibilityRole="header" style={{ color: colors.onHero }}>
              {hero.title}
            </Text>
            <Text style={{ color: colors.heroMuted }}>{hero.body}</Text>
            <Button variant="inverse" label={hero.cta.label} icon={hero.cta.icon} onPress={hero.cta.onPress} style={styles.heroCta} />
          </View>
        </View>
      </Reveal>

      <Card>
        <View style={styles.rowBetween}>
          <Text variant="bodyStrong">واژه‌های تازه‌ی امروز</Text>
          <Text variant="bodyStrong" tone="primary">
            {toPersianDigits(data.newToday)} از {toPersianDigits(data.newTarget)}
          </Text>
        </View>
        <ProgressBar value={data.newToday} max={data.newTarget} label={`${data.newToday} از ${data.newTarget} واژه‌ی تازه`} />
        <View style={styles.rowBetween}>
          <Text variant="caption" tone="muted" style={styles.flex}>
            {data.newRemaining > 0 ? `${toPersianDigits(data.newRemaining)} واژه‌ی دیگر تا هدف امروز` : 'هدف امروز کامل شد'}
          </Text>
          <Button label="افزودن" icon="plus" variant="secondary" compact block={false} onPress={() => router.push('/add')} />
        </View>
      </Card>

      <View style={styles.section}>
        <Text variant="heading">جعبه‌های لایتنر</Text>
        <BoxStrip counts={data.boxes} onSelect={(b) => router.push({ pathname: '/vocabulary', params: { box: String(b) } })} />
      </View>

      {data.recommended ? (
        <Pressable
          onPress={() => router.push({ pathname: '/practice/[skill]', params: { skill: data.recommended! } })}
          accessibilityRole="button"
          accessibilityLabel={`تمرین پیشنهادی: ${SKILL_FA[data.recommended]}`}
          style={({ pressed }) => [styles.suggest, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.suggestIcon, { backgroundColor: colors.primarySoft }]}>
            <Icon name="edit-3" tone="primary" />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">تمرین پیشنهادی: {SKILL_FA[data.recommended]}</Text>
            <Text variant="caption" tone="muted">
              {SKILL_BLURB_FA[data.recommended]}
            </Text>
          </View>
          <Icon name={ICON_ENTER} tone="muted" />
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text variant="heading">استمرار</Text>
          <Text variant="label" tone="muted">
            {data.streak > 0 ? `${toPersianDigits(data.streak)} روز پیاپی` : 'امروز شروع کنید'}
          </Text>
        </View>
        <View style={styles.week} accessible accessibilityLabel={`فعالیت هفت روز اخیر: ${data.week.filter((d) => d.active).length} روز فعال`}>
          {data.week.map((d) => (
            <View key={d.dayKey} style={styles.dayCell}>
              <View
                style={[
                  styles.day,
                  {
                    backgroundColor: d.active ? colors.primary : 'transparent',
                    borderColor: d.isToday ? colors.primary : colors.border,
                    borderWidth: d.isToday || !d.active ? 1.5 : 0,
                  },
                ]}
              >
                {d.active ? <Icon name="check" size="sm" tone="onPrimary" /> : null}
              </View>
              <Text variant="caption" tone="muted">
                {weekdayInitialFa(d.dayKey)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  date: { marginTop: -space.sm },
  section: { gap: space.md, marginTop: space.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  heroWrap: { paddingBottom: 14 },
  peek: { position: 'absolute', height: 40, borderRadius: radius.xl },
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.md },
  heroCta: { marginTop: space.sm },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, minHeight: MIN_TOUCH + 20 },
  suggestIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', gap: space.xs },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
