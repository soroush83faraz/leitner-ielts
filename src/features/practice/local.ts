/**
 * Offline practice content built only from the user's own cards. Pure: the random
 * source is injected so tests are deterministic.
 */
import type { Topic, VocabularyEntry, VocabularyWithState } from '@/features/vocabulary/model';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Prefers words in low boxes (shakier memory) but keeps variety. */
export function pickTargets(cards: VocabularyWithState[], count: number, rng: Rng = Math.random): VocabularyWithState[] {
  const weighted = cards.map((c) => ({ c, w: (6 - c.state.boxNumber) * (0.5 + rng()) }));
  return weighted.sort((a, b) => b.w - a.w).slice(0, count).map((x) => x.c);
}

export function contextSentence(e: VocabularyEntry): string | null {
  const s = e.examples.find((x) => x.sentence.trim())?.sentence ?? e.sourceSentence;
  return s && s.trim() ? s.trim() : null;
}

export interface McQuestion {
  vocabularyId: string;
  term: string;
  sentence: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/**
 * "What does the highlighted word mean here?" built from saved context sentences,
 * with distractors taken from other saved meanings.
 */
export function buildReadingQuestions(targets: VocabularyWithState[], pool: VocabularyWithState[], rng: Rng = Math.random): McQuestion[] {
  const out: McQuestion[] = [];
  for (const { entry } of targets) {
    const sentence = contextSentence(entry);
    const meaning = entry.meaningFa?.trim();
    if (!sentence || !meaning) continue;
    const distractors = shuffle(
      [...new Set(pool.filter((p) => p.entry.id !== entry.id && p.entry.meaningFa?.trim()).map((p) => p.entry.meaningFa!.trim()))].filter((m) => m !== meaning),
      rng,
    ).slice(0, 3);
    if (distractors.length < 3) continue;
    const options = shuffle([meaning, ...distractors], rng);
    out.push({
      vocabularyId: entry.id,
      term: entry.term,
      sentence,
      question: `در این جمله، «${entry.term}» چه معنایی دارد؟`,
      options,
      answerIndex: options.indexOf(meaning),
      explanation: entry.definitionEn ? `${meaning} — ${entry.definitionEn}` : meaning,
    });
  }
  return out;
}

export interface DictationItem {
  vocabularyId: string;
  /** What is spoken and what must be typed. */
  text: string;
  kind: 'word' | 'sentence';
  term: string;
  meaningFa: string | null;
}

export function buildDictationItems(targets: VocabularyWithState[], rng: Rng = Math.random): DictationItem[] {
  return targets.map(({ entry }) => {
    const sentence = contextSentence(entry);
    const useSentence = !!sentence && sentence.length <= 120 && rng() < 0.5;
    return { vocabularyId: entry.id, text: useSentence ? sentence! : entry.term, kind: useSentence ? 'sentence' : 'word', term: entry.term, meaningFa: entry.meaningFa };
  });
}

/** Original, IELTS-style (not copied from official materials). Keyed by part and topic. */
export const SPEAKING_PROMPTS: Record<1 | 2 | 3, Record<Topic, string[]>> = {
  1: {
    Education: ['Do you prefer studying alone or with other people? Why?', 'What subject did you enjoy most at school?'],
    Technology: ['How often do you use your phone during the day?', 'Is there a piece of technology you could not live without?'],
    Environment: ['Do you do anything in your daily life to protect the environment?', 'Is there much green space in the area where you live?'],
    Health: ['What do you do to keep fit?', 'Do you think you eat healthily?'],
    Work: ['What kind of job would you like to have in the future?', 'Do you prefer working in the morning or the evening?'],
    Society: ['How well do you know your neighbours?', 'Do you enjoy spending time in crowded places?'],
    Other: ['What do you usually do at weekends?', 'Tell me about a place you like to visit.'],
  },
  2: {
    Education: ['Describe a teacher who influenced you. You should say who they were, what they taught you, how they taught, and explain why they were important to you.'],
    Technology: ['Describe a useful app or website you use. You should say what it is, how you found it, what you use it for, and explain why it is useful.'],
    Environment: ['Describe a place in nature you would like to protect. You should say where it is, what is special about it, what threatens it, and explain what could be done.'],
    Health: ['Describe a time you changed a habit to be healthier. You should say what the habit was, what you changed, how it went, and explain how you felt afterwards.'],
    Work: ['Describe a job you admire. You should say what the job is, who does it, what skills it needs, and explain why you admire it.'],
    Society: ['Describe a tradition in your country that you enjoy. You should say what it is, when it happens, what people do, and explain why you like it.'],
    Other: ['Describe a goal you have achieved. You should say what it was, how you worked towards it, what difficulties you had, and explain how you felt.'],
  },
  3: {
    Education: ['Some people think universities should teach practical skills only. To what extent do you agree?', 'How might education change over the next twenty years?'],
    Technology: ['Does technology make people more or less connected with each other?', 'What risks come with relying heavily on artificial intelligence?'],
    Environment: ['Who should take more responsibility for protecting the environment: governments or individuals?', 'Why is it hard for societies to change their habits?'],
    Health: ['Why do many people find it hard to maintain a healthy lifestyle?', 'Should governments tax unhealthy food? Why or why not?'],
    Work: ['How has the idea of a good job changed over the last few decades?', 'Is working from home better for society as a whole?'],
    Society: ['What problems do big cities create for their residents?', 'How important is it for communities to preserve traditions?'],
    Other: ['What makes a person successful in your opinion?', 'How do attitudes to money differ between generations?'],
  },
};

export const WRITING_PROMPTS: Record<Topic, string[]> = {
  Education: ['Write 3–4 sentences about how technology has changed the way students learn.'],
  Technology: ['Write 3–4 sentences about one advantage and one disadvantage of social media.'],
  Environment: ['Write 3–4 sentences about what cities can do to reduce pollution.'],
  Health: ['Write 3–4 sentences about why regular exercise matters.'],
  Work: ['Write 3–4 sentences about what makes a workplace enjoyable.'],
  Society: ['Write 3–4 sentences about how communities can support elderly people.'],
  Other: ['Write 3–4 sentences about a change that has improved your daily life.'],
};

export function pickPrompt(bank: string[], rng: Rng = Math.random): string {
  return bank[Math.floor(rng() * bank.length)] ?? bank[0];
}

/** Most common topic among the targets, or 'Other'. */
export function dominantTopic(targets: VocabularyWithState[]): Topic {
  const counts = new Map<Topic, number>();
  for (const t of targets) if (t.entry.topic) counts.set(t.entry.topic, (counts.get(t.entry.topic) ?? 0) + 1);
  let best: Topic = 'Other';
  let n = 0;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
}
