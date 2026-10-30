import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BoxStrip } from '@/components/BoxStrip';
import { Button, IconButton } from '@/components/Button';
import { BoxBadge, Chip, ChipRow, Tag } from '@/components/Chips';
import { StateView } from '@/components/Feedback';
import { ICON_ENTER, Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EnText, Text } from '@/components/Text';
import type { BoxNumber } from '@/constants/leitner';
import { boxCounts, listVocabulary, type StatusFilter, type VocabularyListItem } from '@/database/repositories/vocabularyRepo';
import { isDue } from '@/features/leitner/algorithm';
import { ENTRY_TYPES, ENTRY_TYPE_FA, TOPICS, TOPIC_FA, type EntryType, type Topic } from '@/features/vocabulary/model';
import { useApp } from '@/state/AppProvider';
import { useData } from '@/state/useData';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, fonts, radius, space } from '@/theme/tokens';
import { toPersianDigits } from '@/utils/text';

const STATUS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'due', label: 'موعددار' },
  { key: 'new', label: 'تازه' },
  { key: 'incomplete', label: 'ناقص' },
  { key: 'archived', label: 'بایگانی' },
];

export default function VocabularyScreen() {
  const { colors } = useTheme();
  const { now } = useApp();
  const params = useLocalSearchParams<{ box?: string }>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [box, setBox] = useState<BoxNumber | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [type, setType] = useState<EntryType | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);

  // Deep link from the Today screen: adopt the box param when it changes.
  const [seenBoxParam, setSeenBoxParam] = useState<string | undefined>(undefined);
  if (params.box !== seenBoxParam) {
    setSeenBoxParam(params.box);
    const n = Number(params.box);
    if (n >= 1 && n <= 5) setBox(n as BoxNumber);
  }

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = useData(
    async (c) => ({
      items: await listVocabulary(c.db, { nowIso: c.nowIso, search: query, status, box, topic, entryType: type }),
      boxes: await boxCounts(c.db),
    }),
    [query, status, box, topic, type],
  );

  const filtered = !!(query || status !== 'all' || box || topic || type);
  const reset = () => {
    setSearch('');
    setQuery('');
    setStatus('all');
    setBox(null);
    setTopic(null);
    setType(null);
  };

  const header = (
    <View style={styles.header}>
      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="search" tone="muted" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="جستجوی واژه یا معنی"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="جستجوی واژه یا معنی"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text, fontFamily: fonts.fa.regular }]}
        />
        {search ? <IconButton icon="x" label="پاک کردن جستجو" onPress={() => setSearch('')} /> : null}
      </View>

      {list.data ? <BoxStrip compact counts={list.data.boxes} selected={box} onSelect={(b) => setBox(box === b ? null : b)} /> : null}

      <ChipRow>
        {STATUS.map((s) => (
          <Chip key={s.key} label={s.label} selected={status === s.key} onPress={() => setStatus(s.key)} />
        ))}
        <Chip label="فیلتر بیشتر" selected={moreFilters || !!topic || !!type} onPress={() => setMoreFilters((m) => !m)} />
      </ChipRow>

      {moreFilters ? (
        <View style={styles.header}>
          <Text variant="label">موضوع</Text>
          <ChipRow>
            {TOPICS.map((t) => (
              <Chip key={t} label={TOPIC_FA[t]} selected={topic === t} onPress={() => setTopic(topic === t ? null : t)} />
            ))}
          </ChipRow>
          <Text variant="label">نوع</Text>
          <ChipRow>
            {ENTRY_TYPES.map((t) => (
              <Chip key={t} label={ENTRY_TYPE_FA[t]} selected={type === t} onPress={() => setType(type === t ? null : t)} />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {list.data ? (
        <View style={styles.countRow}>
          <Text variant="caption" tone="muted">
            {toPersianDigits(list.data.items.length)} کارت{filtered ? ' با فیلترهای فعلی' : ''}
          </Text>
          {filtered ? <Button label="پاک کردن فیلترها" variant="quiet" block={false} onPress={reset} /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen
      title="واژگان"
      fixed
      right={<IconButton icon="plus" label="افزودن واژه" tone="primary" onPress={() => router.push('/add')} />}
    >
      {list.error && !list.data ? (
        <StateView kind="error" title="خواندن واژگان ممکن نشد" message={list.error} actionLabel="تلاش دوباره" onAction={list.reload} />
      ) : !list.data ? (
        <StateView kind="loading" />
      ) : (
        <FlatList
          data={list.data.items}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={header}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Row item={item} nowIso={now()} />}
          ListEmptyComponent={
            filtered ? (
              <StateView kind="empty" title="کارتی با این فیلترها پیدا نشد" message="جستجو یا فیلترها را تغییر دهید." actionLabel="پاک کردن فیلترها" onAction={reset} />
            ) : (
              <StateView kind="empty" title="هنوز واژه‌ای ندارید" message="اولین واژه‌ها را اضافه کنید تا لایتنر شروع شود." actionLabel="افزودن واژه" onAction={() => router.push('/add')} />
            )
          }
        />
      )}
    </Screen>
  );
}

function Row({ item, nowIso }: { item: VocabularyListItem; nowIso: string }) {
  const { colors } = useTheme();
  const due = isDue({ nextReviewAt: item.nextReviewAt }, nowIso);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/word/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.term}، ${item.meaningFa ?? 'بدون معنی'}، جعبه ${item.boxNumber}`}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: pressed ? colors.sunken : 'transparent' }]}
    >
      <View style={styles.flex}>
        <EnText variant="bodyStrong" serif size={21} numberOfLines={1}>
          {item.term}
        </EnText>
        <View style={styles.tags}>
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.meaning}>
            {item.meaningFa ?? 'معنی ثبت نشده'}
          </Text>
          <BoxBadge box={item.boxNumber} />
          {item.archivedAt ? <Tag label="بایگانی" /> : item.reviewCount === 0 ? <Tag label="تازه" kind="info" /> : due ? <Tag label="موعددار" kind="warn" /> : null}
          {!item.meaningFa ? <Tag label="ناقص" kind="warn" /> : null}
        </View>
      </View>
      <Icon name={ICON_ENTER} tone="muted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: { gap: space.md, paddingBottom: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: space.md, minHeight: MIN_TOUCH + 4 },
  searchInput: { flex: 1, fontSize: 16, minHeight: MIN_TOUCH, paddingVertical: 0 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listContent: { paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: MIN_TOUCH + 12 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  meaning: { flexShrink: 1 },
});
