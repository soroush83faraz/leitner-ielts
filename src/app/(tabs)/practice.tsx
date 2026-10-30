import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner, StateView } from '@/components/Feedback';
import { ICON_ENTER, Icon, type IconName } from '@/components/Icon';
import { Tag } from '@/components/Chips';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { completedCountsBySkill, SKILLS, type Skill } from '@/database/repositories/practiceRepo';
import { countVocabulary } from '@/database/repositories/vocabularyRepo';
import { MIN_WORDS, SKILL_BLURB_FA, SKILL_FA, recommendSkill } from '@/features/practice/recommend';
import { isAiConfigured } from '@/services/ai';
import { useData } from '@/state/useData';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { parseIso, startOfLocalDayMs, toIso } from '@/utils/dates';
import { toPersianDigits } from '@/utils/text';

const ICONS: Record<Skill, IconName> = { reading: 'book-open', listening: 'headphones', writing: 'edit-3', speaking: 'message-circle' };
const NEEDS_AI: Record<Skill, string | null> = {
  reading: null,
  listening: null,
  writing: 'بازخورد با هوش مصنوعی (اختیاری)',
  speaking: 'بازخورد با هوش مصنوعی (اختیاری)',
};

export default function PracticeTab() {
  const { colors } = useTheme();
  const { data, error, reload } = useData(async (c) => {
    const weekAgo = toIso(startOfLocalDayMs(parseIso(c.nowIso), c.timeZone, -6));
    const [words, week, total] = await Promise.all([countVocabulary(c.db), completedCountsBySkill(c.db, weekAgo), completedCountsBySkill(c.db)]);
    return { words, week, total, recommended: recommendSkill(week, words) };
  });

  return (
    <Screen title="تمرین" tabbed>
      <Text tone="muted">تمرین‌های کوتاه با واژه‌های خودتان. نتیجه‌ی این تمرین‌ها جعبه‌های لایتنر را تغییر نمی‌دهد؛ مرور لایتنر یادآوری است و این تمرین‌ها کاربرد.</Text>
      {error && !data ? (
        <StateView kind="error" title="خواندن اطلاعات ممکن نشد" message={error} actionLabel="تلاش دوباره" onAction={reload} />
      ) : !data ? (
        <StateView kind="loading" />
      ) : data.words === 0 ? (
        <StateView kind="empty" title="ابتدا چند واژه اضافه کنید" message="تمرین‌ها از کارت‌های ذخیره‌شده ساخته می‌شوند." actionLabel="افزودن واژه" onAction={() => router.push('/add')} />
      ) : (
        <View style={styles.list}>
          {SKILLS.map((s) => {
            const enough = data.words >= MIN_WORDS[s];
            const rec = data.recommended === s;
            return (
              <Pressable
                key={s}
                disabled={!enough}
                onPress={() => router.push({ pathname: '/practice/[skill]', params: { skill: s } })}
                accessibilityRole="button"
                accessibilityState={{ disabled: !enough }}
                accessibilityLabel={`${SKILL_FA[s]}. ${SKILL_BLURB_FA[s]}${rec ? ' پیشنهادی' : ''}`}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.surface, borderColor: rec ? colors.primary : colors.border, borderWidth: rec ? 2 : 1, opacity: !enough ? 0.55 : pressed ? 0.85 : 1 },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                  <Icon name={ICONS[s]} tone="primary" />
                </View>
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <Text variant="bodyStrong">{SKILL_FA[s]}</Text>
                    {rec ? <Tag label="پیشنهادی" kind="info" /> : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {SKILL_BLURB_FA[s]}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {enough
                      ? `${toPersianDigits(data.total[s])} تمرین انجام‌شده${NEEDS_AI[s] ? ` · ${NEEDS_AI[s]}` : ''}`
                      : `حداقل ${toPersianDigits(MIN_WORDS[s])} کارت لازم است`}
                  </Text>
                </View>
                <Icon name={ICON_ENTER} tone="muted" />
              </Pressable>
            );
          })}
          {!isAiConfigured ? <Banner kind="info" text="هوش مصنوعی روی این نسخه تنظیم نشده. خواندن و شنیدن کامل کار می‌کنند؛ در نوشتن و گفتاری می‌توانید متن را بدون بازخورد ذخیره کنید." /> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, minHeight: MIN_TOUCH + 36 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
