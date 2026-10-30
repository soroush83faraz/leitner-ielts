import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chips';
import { Banner } from '@/components/Feedback';
import { EnText, Text } from '@/components/Text';
import { findByNormalizedTerm, type DuplicateHit } from '@/database/repositories/vocabularyRepo';
import { useApp } from '@/state/AppProvider';
import { space } from '@/theme/tokens';
import { normalizeTerm } from '@/utils/text';

const NO_HITS: DuplicateHit[] = [];

/**
 * Looks up existing entries with the same normalised term (debounced) and shows a transparent
 * warning. Nothing is merged: the user can open the existing card or confirm a separate one.
 */
export function useDuplicates(term: string, excludeId?: string) {
  const { db, version } = useApp();
  const [hits, setHits] = useState<DuplicateHit[]>([]);
  useEffect(() => {
    if (normalizeTerm(term).length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      findByNormalizedTerm(db, term, excludeId)
        .then((h) => alive && setHits(h))
        .catch(() => alive && setHits([]));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [db, term, excludeId, version]);
  return normalizeTerm(term).length < 2 ? NO_HITS : hits;
}

export function DuplicateWarning({
  hits,
  confirmed,
  onConfirmedChange,
}: {
  hits: DuplicateHit[];
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <View style={styles.gap}>
      <Banner kind="warn" text={hits.length === 1 ? 'این واژه از قبل در کتابخانه‌ی شما هست.' : `${hits.length} کارت با این واژه از قبل وجود دارد.`} />
      {hits.slice(0, 3).map((h) => (
        <View key={h.id} style={styles.hit}>
          <View style={styles.flex}>
            <EnText variant="bodyStrong" serif>
              {h.term}
            </EnText>
            <Text variant="caption" tone="muted">
              {h.meaningFa ?? 'بدون معنی'}
              {h.archived ? ' · بایگانی‌شده' : ''}
            </Text>
          </View>
          <Button label="مشاهده" variant="secondary" block={false} onPress={() => router.push({ pathname: '/word/[id]', params: { id: h.id } })} />
        </View>
      ))}
      <Chip label="کاربرد یا معنی متفاوتی است؛ کارت جداگانه می‌سازم" selected={confirmed} onPress={() => onConfirmedChange(!confirmed)} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  flex: { flex: 1 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
