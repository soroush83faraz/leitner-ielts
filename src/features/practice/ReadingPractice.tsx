import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import { Banner } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { saveFinishedPractice } from '@/database/repositories/practiceRepo';
import type { VocabularyWithState } from '@/features/vocabulary/model';
import { aiService, describeAiError, isAiConfigured } from '@/services/ai';
import { useApp } from '@/state/AppProvider';
import { ensureAiConsent } from '@/state/aiConsent';
import { newId } from '@/utils/text';

import { buildReadingQuestions, pickTargets } from './local';
import { McqRunner, ResultScreen, type McqAnswer, type McqItem } from './PracticeParts';

type Phase = { name: 'choose' } | { name: 'run'; kind: 'local' | 'ai'; items: McqItem[]; run: number } | { name: 'result'; correct: number; total: number; error?: string };

export function ReadingPractice({ cards, exit }: { cards: VocabularyWithState[]; exit: () => void }) {
  const { db, now, bump, prefs, updatePrefs } = useApp();
  const [phase, setPhase] = useState<Phase>({ name: 'choose' });
  const [ai, setAi] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const localAvailable = useMemo(() => buildReadingQuestions(cards, cards).length, [cards]);

  const startLocal = () => {
    const items = buildReadingQuestions(pickTargets(cards, 8), cards)
      .slice(0, 5)
      .map<McqItem>((q) => ({ id: q.vocabularyId, sentence: q.sentence, question: q.question, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation, optionsLang: 'fa' }));
    setPhase({ name: 'run', kind: 'local', items, run: Date.now() });
  };

  const startAi = async () => {
    if (!(await ensureAiConsent(prefs, updatePrefs, 'چند واژه‌ی انتخاب‌شده از کارت‌های شما'))) return;
    setAi({ busy: true, error: null });
    try {
      const targets = pickTargets(cards, 3).map((c) => ({ term: c.entry.term, meaningFa: c.entry.meaningFa ?? undefined }));
      const task = await aiService.generatePractice({ skill: 'reading', targets });
      if (task.skill !== 'reading') throw new Error('unexpected task shape');
      const items = task.questions.map<McqItem>((q, i) => ({
        id: `ai-${i}`,
        passage: task.passage,
        question: q.question,
        options: q.options,
        answerIndex: q.answerIndex,
        explanation: q.explanationFa,
        optionsLang: 'en',
      }));
      setAi({ busy: false, error: null });
      setPhase({ name: 'run', kind: 'ai', items, run: Date.now() });
    } catch (e) {
      setAi({ busy: false, error: describeAiError(e).message });
    }
  };

  const finish = async (kind: 'local' | 'ai', items: McqItem[], answers: McqAnswer[]) => {
    const correct = answers.filter((a) => a.correct).length;
    try {
      await saveFinishedPractice(db, {
        id: newId(),
        skill: 'reading',
        activityType: kind === 'ai' ? 'ai_passage' : 'context_meaning',
        targetVocabularyIds: kind === 'local' ? items.map((i) => i.id) : [],
        prompt: kind === 'ai' ? (items[0]?.passage ?? '').slice(0, 300) : 'معنی واژه در جمله',
        payload: { answers },
        scoreCorrect: correct,
        scoreTotal: answers.length,
        createdAt: now(),
        completedAt: now(),
      });
      bump();
      setPhase({ name: 'result', correct, total: answers.length });
    } catch {
      setPhase({ name: 'result', correct, total: answers.length, error: 'ذخیره‌ی نتیجه انجام نشد؛ این تمرین در آمار حساب نمی‌شود.' });
    }
  };

  if (phase.name === 'run') {
    return <McqRunner key={phase.run} items={phase.items} onComplete={(a) => finish(phase.kind, phase.items, a)} exit={exit} />;
  }
  if (phase.name === 'result') {
    return <ResultScreen title="خواندن" correct={phase.correct} total={phase.total} note={phase.error} onAgain={() => setPhase({ name: 'choose' })} onDone={exit} />;
  }

  return (
    <Screen title="خواندن" back={exit}>
      <Text tone="muted">سؤال کوتاه درباره‌ی معنی واژه در بافت. یک نوع تمرین انتخاب کنید.</Text>

      <Text variant="heading">از کارت‌های خودم</Text>
      <Text tone="muted">
        {localAvailable > 0
          ? 'جمله‌ی نمونه‌ی کارت‌ها نشان داده می‌شود و معنی درست را انتخاب می‌کنید. بدون اینترنت هم کار می‌کند.'
          : 'برای این تمرین حداقل چهار کارت با معنی لازم است و هر سؤال به جمله‌ی نمونه یا جمله‌ی زمینه‌ی کارت نیاز دارد.'}
      </Text>
      <Button label="شروع با کارت‌هایم" icon="play" disabled={localAvailable === 0} onPress={startLocal} />
      {localAvailable === 0 ? <Button label="افزودن واژه" variant="quiet" block={false} onPress={() => router.push('/add')} /> : null}

      <Text variant="heading">متن کوتاه با هوش مصنوعی</Text>
      <Text tone="muted">یک متن کوتاه با واژه‌های شما و سؤال‌های درک مطلب و هم‌معنایی. نیازمند اینترنت.</Text>
      <Button label="ساخت متن و سؤال" icon="cpu" variant="secondary" loading={ai.busy} disabled={!isAiConfigured || cards.length === 0} onPress={startAi} />
      {!isAiConfigured ? <Text variant="caption" tone="muted">هوش مصنوعی روی این نسخه تنظیم نشده است.</Text> : null}
      {ai.error ? <Banner kind="danger" text={ai.error} actionLabel="تلاش دوباره" onAction={startAi} /> : null}
    </Screen>
  );
}
