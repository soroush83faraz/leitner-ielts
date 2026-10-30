import { checkDictation, levenshtein, tokenize } from '@/features/practice/dictation';
import { buildDictationItems, buildReadingQuestions, dominantTopic, pickTargets, shuffle } from '@/features/practice/local';
import { recommendSkill } from '@/features/practice/recommend';
import { accuracy, bucketReviewsByDay, summarizeProductiveUse } from '@/features/progress/stats';
import type { VocabularyEntry, VocabularyWithState } from '@/features/vocabulary/model';
import { createInitialState } from '@/features/leitner/algorithm';

function card(id: string, term: string, meaningFa: string | null, extra: Partial<VocabularyEntry> = {}, box = 1): VocabularyWithState {
  const entry: VocabularyEntry = {
    id, term, normalizedTerm: term, meaningFa, definitionEn: null, partOfSpeech: null, ipa: null, examples: [], collocations: [],
    wordFamily: [], topic: null, entryType: 'word', sourceSentence: null, sourceType: 'manual', createdAt: 'x', updatedAt: 'x', archivedAt: null, ...extra,
  };
  const state = { ...createInitialState(id, '2026-01-01T00:00:00.000Z'), boxNumber: box as 1 };
  return { entry, state };
}

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe('dictation', () => {
  it('accepts exact answers ignoring case, punctuation and spacing', () => {
    expect(checkDictation('The city is crowded.', '  the CITY is   crowded ').verdict).toBe('correct');
    expect(checkDictation("Don’t worry", "don't worry").verdict).toBe('correct');
  });

  it('flags a near miss as a spelling error, not as correct', () => {
    const r = checkDictation('accommodate', 'acommodate');
    expect(r.verdict).toBe('spelling_error');
    expect(r.tokens[0]).toMatchObject({ expected: 'accommodate', typed: 'acommodate', status: 'spelling' });
  });

  it('treats a materially different word as different, even if short', () => {
    expect(checkDictation('affect', 'effect').verdict).toBe('different'); // a real, different English word
    expect(checkDictation('mitigate', 'migrate').verdict).not.toBe('correct');
    expect(checkDictation('rapid', 'slow').verdict).toBe('different');
    expect(checkDictation('cat', 'car').verdict).toBe('spelling_error');
    expect(checkDictation('big', 'bag').verdict).toBe('spelling_error');
  });

  it('first letter must match for a spelling near-miss', () => {
    expect(checkDictation('house', 'mouse').verdict).toBe('different');
  });

  it('aligns sentences word by word and reports missing/extra words', () => {
    const r = checkDictation('Residents are pleased with the new parks', 'residents pleased with the new parks today');
    expect(r.verdict).toBe('different');
    expect(r.tokens.find((t) => t.expected === 'are')?.status).toBe('missing');
    expect(r.tokens.find((t) => t.typed === 'today')?.status).toBe('extra');
  });

  it('an empty answer is different with every word missing', () => {
    const r = checkDictation('hello world', '   ');
    expect(r.verdict).toBe('different');
    expect(r.tokens.every((t) => t.status === 'missing')).toBe(true);
  });

  it('helpers behave', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(tokenize('Hello, world! It’s well-known.')).toEqual(['hello', 'world', "it's", 'well-known']);
  });
});

describe('reading questions from saved cards', () => {
  const pool = [
    card('1', 'mitigate', 'کاهش دادن', { examples: [{ sentence: 'Trees mitigate the heat.', translationFa: null }], definitionEn: 'make less severe' }),
    card('2', 'resilient', 'مقاوم'),
    card('3', 'ubiquitous', 'همه‌جا حاضر'),
    card('4', 'scarce', 'کمیاب'),
    card('5', 'novel', 'نو', { sourceSentence: 'The idea was novel.' }),
  ];

  it('builds a multiple-choice question with the right answer among 4 distinct options', () => {
    const qs = buildReadingQuestions(pool, pool, seeded());
    expect(qs.map((q) => q.term).sort()).toEqual(['mitigate', 'novel']);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answerIndex]).toBe(pool.find((p) => p.entry.id === q.vocabularyId)!.entry.meaningFa);
    }
  });

  it('skips cards without a context sentence or meaning, and needs enough distractors', () => {
    expect(buildReadingQuestions([pool[1]], pool, seeded())).toEqual([]);
    expect(buildReadingQuestions([pool[0]], pool.slice(0, 2), seeded())).toEqual([]);
  });
});

describe('selection helpers', () => {
  it('shuffle keeps all items; pickTargets favours low boxes', () => {
    expect(shuffle([1, 2, 3, 4], seeded(3)).sort()).toEqual([1, 2, 3, 4]);
    const cards = [card('a', 'a1', 'x', {}, 5), card('b', 'b1', 'x', {}, 1), card('c', 'c1', 'x', {}, 5), card('d', 'd1', 'x', {}, 1)];
    const picked = pickTargets(cards, 2, () => 0.5).map((c) => c.entry.id).sort();
    expect(picked).toEqual(['b', 'd']);
  });

  it('dictation items speak a sentence only when one exists', () => {
    const items = buildDictationItems([card('1', 'mitigate', 'x', { examples: [{ sentence: 'Trees mitigate heat.', translationFa: null }] }), card('2', 'novel', 'y')], () => 0.1);
    expect(items[0]).toMatchObject({ kind: 'sentence', text: 'Trees mitigate heat.' });
    expect(items[1]).toMatchObject({ kind: 'word', text: 'novel' });
  });

  it('dominantTopic picks the most common, else Other', () => {
    expect(dominantTopic([card('1', 'a', 'x', { topic: 'Health' }), card('2', 'b', 'x', { topic: 'Health' }), card('3', 'c', 'x', { topic: 'Work' })])).toBe('Health');
    expect(dominantTopic([card('1', 'a', 'x')])).toBe('Other');
  });

  it('recommends the least-practised feasible skill', () => {
    expect(recommendSkill({ reading: 2, listening: 0, writing: 1, speaking: 1 }, 10)).toBe('listening');
    expect(recommendSkill({ reading: 0, listening: 3, writing: 3, speaking: 3 }, 2)).toBe('listening'); // reading needs 4 words
    expect(recommendSkill({ reading: 0, listening: 0, writing: 0, speaking: 0 }, 0)).toBeNull();
  });
});

describe('progress statistics', () => {
  it('buckets reviews by LOCAL day and zero-fills', () => {
    const rows = [
      { at: '2026-06-01T22:30:00.000Z', result: 'correct' as const }, // 2 Jun in Tehran
      { at: '2026-06-02T08:00:00.000Z', result: 'incorrect' as const },
    ];
    const b = bucketReviewsByDay(rows, 'Asia/Tehran', '2026-06-03', 3);
    expect(b.map((x) => [x.dayKey, x.correct, x.incorrect])).toEqual([
      ['2026-06-01', 0, 0],
      ['2026-06-02', 1, 1],
      ['2026-06-03', 0, 0],
    ]);
  });

  it('accuracy is null with no reviews (no fake 0% or 100%)', () => {
    expect(accuracy(0, 0)).toBeNull();
    expect(accuracy(3, 1)).toBe(0.75);
  });

  it('productive use counts only assessed, correct uses from writing/speaking', () => {
    const p = summarizeProductiveUse([
      { skill: 'writing', feedback: { vocabularyUse: [{ term: 'Mitigate', used: true, correctness: 'correct' }, { term: 'novel', used: true, correctness: 'incorrect' }, { term: 'scarce', used: false, correctness: null }] } },
      { skill: 'speaking', feedback: { vocabularyUse: [{ term: 'mitigate', used: true, correctness: 'correct' }, { term: 'x', used: true, correctness: 'uncertain' }] } },
      { skill: 'writing', feedback: null },
      { skill: 'reading', feedback: { vocabularyUse: [{ term: 'z', used: true, correctness: 'correct' }] } },
    ]);
    expect(p).toMatchObject({ sessions: 3, correctUses: 2, incorrectUses: 1, uncertainUses: 1, withoutFeedback: 1 });
    expect(p.distinctCorrectTerms).toEqual(['mitigate']);
  });
});
