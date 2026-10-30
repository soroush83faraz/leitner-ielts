import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/Screen';
import { StateView } from '@/components/Feedback';
import { getActiveVocabulary } from '@/database/repositories/vocabularyRepo';
import { SKILLS, type Skill } from '@/database/repositories/practiceRepo';
import { ListeningPractice } from '@/features/practice/ListeningPractice';
import { ProductivePractice } from '@/features/practice/ProductivePractice';
import { ReadingPractice } from '@/features/practice/ReadingPractice';
import { SKILL_FA } from '@/features/practice/recommend';
import { useData } from '@/state/useData';

export default function PracticeSkill() {
  const { skill } = useLocalSearchParams<{ skill: string }>();
  const valid = (SKILLS as readonly string[]).includes(String(skill));
  const exit = () => (router.canGoBack() ? router.back() : router.replace('/practice'));
  // Loaded once per visit: the question set must not reshuffle under the learner when data changes.
  const { data: cards, error, reload } = useData((c) => getActiveVocabulary(c.db), [skill]);

  if (!valid) {
    return (
      <Screen title="تمرین" back={exit}>
        <StateView kind="error" title="این تمرین وجود ندارد" actionLabel="بازگشت" onAction={exit} />
      </Screen>
    );
  }
  const s = skill as Skill;
  if (!cards) {
    return (
      <Screen title={SKILL_FA[s]} back={exit}>
        {error ? <StateView kind="error" title="خواندن کارت‌ها ممکن نشد" message={error} actionLabel="تلاش دوباره" onAction={reload} /> : <StateView kind="loading" />}
      </Screen>
    );
  }
  switch (s) {
    case 'reading':
      return <ReadingPractice cards={cards} exit={exit} />;
    case 'listening':
      return <ListeningPractice cards={cards} exit={exit} />;
    default:
      return <ProductivePractice mode={s} cards={cards} exit={exit} />;
  }
}
