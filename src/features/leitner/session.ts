import type { ReviewResult } from './algorithm';

export interface SessionOutcome {
  vocabularyId: string;
  term: string;
  meaningFa: string | null;
  result: ReviewResult;
}

export interface SessionSummary {
  total: number;
  correct: number;
  incorrect: number;
  /** 0..1, or null when nothing was reviewed. */
  accuracy: number | null;
  missed: SessionOutcome[];
}

export function summarizeSession(outcomes: SessionOutcome[]): SessionSummary {
  const correct = outcomes.filter((o) => o.result === 'correct').length;
  const incorrect = outcomes.length - correct;
  return {
    total: outcomes.length,
    correct,
    incorrect,
    accuracy: outcomes.length === 0 ? null : correct / outcomes.length,
    missed: outcomes.filter((o) => o.result === 'incorrect'),
  };
}
