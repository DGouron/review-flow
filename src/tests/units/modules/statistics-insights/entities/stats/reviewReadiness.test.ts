import { describe, expect, it } from 'vitest';

import {
  gradeRank,
  outcomeOfReviewStats,
  readinessOf,
} from '@/modules/statistics-insights/entities/stats/reviewReadiness.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

describe('outcomeOfReviewStats', () => {
  it('reads the verdict and the grade the review recorded', () => {
    const review = ReviewStatsFactory.create({ verdict: 'ready', grade: 'B' });

    expect(outcomeOfReviewStats(review)).toEqual({ verdict: 'ready', grade: 'B' });
  });

  it('rebuilds them from the counts of a review recorded before verdicts', () => {
    const review = ReviewStatsFactory.create({ score: 8, blocking: 0, warnings: 1 });

    expect(outcomeOfReviewStats(review)).toEqual({ verdict: 'changes', grade: 'C' });
  });

  it('has none for a review recorded before verdicts without a score', () => {
    const review = ReviewStatsFactory.create({ score: null });

    expect(outcomeOfReviewStats(review)).toEqual({ verdict: null, grade: null });
  });
});

describe('readinessOf', () => {
  it('has no rate before any judged review', () => {
    const readiness = readinessOf([ReviewStatsFactory.create({ score: null })]);

    expect(readiness.readyRate).toBeNull();
    expect(readiness.judged).toBe(0);
  });

  it('gives the share of ready reviews and the count of each grade', () => {
    const readiness = readinessOf([
      ReviewStatsFactory.create({ verdict: 'ready', grade: 'A' }),
      ReviewStatsFactory.create({ verdict: 'ready', grade: 'B' }),
      ReviewStatsFactory.create({ verdict: 'changes', grade: 'C' }),
      ReviewStatsFactory.create({ verdict: 'changes', grade: 'D' }),
      ReviewStatsFactory.create({ score: null }),
    ]);

    expect(readiness).toEqual({
      judged: 4,
      ready: 2,
      readyRate: 50,
      grades: { A: 1, B: 1, C: 1, D: 1, E: 0 },
    });
  });
});

describe('gradeRank', () => {
  it('ranks A highest and E lowest', () => {
    expect((['A', 'B', 'C', 'D', 'E'] as const).map(gradeRank)).toEqual([4, 3, 2, 1, 0]);
  });
});
