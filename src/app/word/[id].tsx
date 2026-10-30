import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { BoxBadge, Tag } from '@/components/Chips';
import { StateView } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import { boxHistory } from '@/database/repositories/reviewRepo';
import { deleteVocabulary, getVocabulary, setArchived } from '@/database/repositories/vocabularyRepo';
import { isDue } from '@/features/leitner/algorithm';
import { ENTRY_TYPE_FA, SOURCE_TYPE_FA, TOPIC_FA, isIncomplete } from '@/features/vocabulary/model';
import { useApp } from '@/state/AppProvider';
import { useEnglishSpeech } from '@/state/device';
import { useData } from '@/state/useData';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { confirmAsync } from '@/utils/confirm';
import { percent, relativeDayFa, shortDateFa } from '@/utils/format';
import { toPersianDigits } from '@/utils/text';

export default function WordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, now, timeZone, bump } = useApp();
  const { colors } = useTheme();
  const speech = useEnglishSpeech();
  const { data, loading, error, reload } = useData(
    async (c) => {
      const v = await getVocabulary(c.db, String(id));
      return v ? { ...v, history: await boxHistory(c.db, v.entry.id, 8) } : null;
    },
    [id],
  );

  if (loading && !data) {
    return (
      <Screen title="کارت" back>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen title="کارت" back>
        <StateView kind="error" title="خواندن کارت ممکن نشد" message={error} actionLabel="تلاش دوباره" onAction={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="کارت" back>
        <StateView kind="empty" title="این کارت پیدا نشد" message="ممکن است حذف شده باشد." actionLabel="بازگشت به واژگان" onAction={() => router.replace('/vocabulary')} />
      </Screen>
    );
  }

  const { entry: e, state: s, history } = data;
  const nowIso = now();
  const due = isDue(s, nowIso);
  const archived = e.archivedAt !== null;

  const toggleArchive = async () => {
    await setArchived(db, e.id, !archived, now());
    bump();
  };
  const remove = async () => {
    const ok = await confirmAsync({
      title: 'حذف دائمی کارت؟',
      message: `«${e.term}» و جعبه‌ی لایتنر آن حذف می‌شود. این کار برگشت‌پذیر نیست. اگر فقط نمی‌خواهید آن را مرور کنید، بایگانی بهتر است.`,
      confirmLabel: 'حذف دائمی',
      destructive: true,
    });
    if (!ok) return;
    await deleteVocabulary(db, e.id);
    bump();
    router.replace('/vocabulary');
  };

  return (
    <Screen
      title="کارت"
      back
      right={<IconButton icon="edit-2" label="ویرایش کارت" onPress={() => router.push({ pathname: '/word/edit/[id]', params: { id: e.id } })} />}
      footer={
        <Button
          label={due ? 'مرور این کارت' : 'مرور زودهنگام این کارت'}
          icon="play"
          variant={due ? 'primary' : 'secondary'}
          onPress={() => router.push({ pathname: '/review', params: { id: e.id } })}
          hint={due ? undefined : 'موعد مرور هنوز نرسیده؛ ثبت نتیجه زمان‌بندی را تغییر می‌دهد'}
        />
      }
    >
      <Card>
        <View style={styles.row}>
          <EnText serif size={36} variant="display" style={styles.flex} accessibilityRole="header">
            {e.term}
          </EnText>
          {speech.available ? <IconButton icon="volume-2" label="پخش تلفظ" tone="primary" onPress={() => speech.speak(e.term)} /> : null}
        </View>
        {e.ipa ? <EnText tone="muted">{e.ipa}</EnText> : null}
        <View style={styles.tags}>
          {e.partOfSpeech ? <Tag label={e.partOfSpeech} /> : null}
          <Tag label={ENTRY_TYPE_FA[e.entryType]} />
          {e.topic ? <Tag label={TOPIC_FA[e.topic]} kind="info" /> : null}
          {isIncomplete(e) ? <Tag label="ناقص" kind="warn" /> : null}
          {archived ? <Tag label="بایگانی‌شده" /> : null}
        </View>
        <Text variant="title">{e.meaningFa ?? 'معنی فارسی ثبت نشده است'}</Text>
        {e.definitionEn ? <EnText tone="muted">{e.definitionEn}</EnText> : null}
      </Card>

      {e.sourceSentence ? (
        <View style={styles.gap}>
          <Text variant="heading">جمله‌ی زمینه</Text>
          <EnText serif italic>
            {e.sourceSentence}
          </EnText>
          <Text variant="caption" tone="muted">
            منبع: {SOURCE_TYPE_FA[e.sourceType]}
          </Text>
        </View>
      ) : null}

      {e.examples.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="heading">جمله‌های نمونه</Text>
          {e.examples.map((x, i) => (
            <View key={i} style={styles.gap}>
              <EnText serif italic>
                {x.sentence}
              </EnText>
              {x.translationFa ? <Text variant="caption" tone="muted">{x.translationFa}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {e.collocations.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="heading">هم‌نشین‌ها</Text>
          <EnText>{e.collocations.join('  ·  ')}</EnText>
        </View>
      ) : null}

      {e.wordFamily.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="heading">خانواده‌ی واژه</Text>
          {e.wordFamily.map((w, i) => (
            <EnText key={i}>
              {w.word}
              {w.partOfSpeech ? `  (${w.partOfSpeech})` : ''}
            </EnText>
          ))}
        </View>
      ) : null}

      <View style={styles.gap}>
        <Text variant="heading">وضعیت در لایتنر</Text>
        <View style={styles.row}>
          <BoxBadge box={s.boxNumber} />
          <Text tone="muted">
            {s.reviewCount === 0 ? 'هنوز مرور نشده' : `مرور بعدی: ${due ? 'همین حالا' : relativeDayFa(s.nextReviewAt, nowIso, timeZone)}`}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {toPersianDigits(s.reviewCount)} مرور · {toPersianDigits(s.correctCount)} درست · {toPersianDigits(s.incorrectCount)} نادرست · دقت {percent(s.correctCount, s.reviewCount)}
        </Text>
        {history.length > 0 ? (
          <View style={styles.gap}>
            {history.map((h, i) => (
              <View key={i} style={[styles.histRow, { borderColor: colors.border }]}>
                <Icon name={h.result === 'correct' ? 'check-circle' : 'x-circle'} tone={h.result === 'correct' ? 'success' : 'danger'} size="sm" />
                <Text variant="caption" style={styles.flex}>
                  {h.result === 'correct' ? 'می‌دانستم' : 'نمی‌دانستم'} · جعبه {toPersianDigits(h.boxBefore)} ← {toPersianDigits(h.boxAfter)}
                </Text>
                <Text variant="caption" tone="muted">
                  {shortDateFa(h.reviewedAt)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.gap}>
        <Button label={archived ? 'بازگردانی از بایگانی' : 'بایگانی کارت'} icon="archive" variant="secondary" onPress={toggleArchive} hint={archived ? undefined : 'از مرور و فهرست پنهان می‌شود ولی حذف نمی‌شود'} />
        <Button label="حذف دائمی" icon="trash-2" variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth },
});
