import { describe, expect, it } from 'vitest';

import {
  gradeRank,
  latestOutcomeOf,
  outcomeOfReviewEvent,
  qualityViewOf,
} from '@/dashboard/modules/quality.js';

describe('outcomeOfReviewEvent', () => {
  it('reads the verdict and the grade the event recorded', () => {
    expect(outcomeOfReviewEvent({ verdict: 'ready', grade: 'B', score: null })).toEqual({
      verdict: 'ready',
      grade: 'B',
    });
  });

  it('rebuilds them from the counts of an event recorded before verdicts', () => {
    expect(outcomeOfReviewEvent({ score: 8, blocking: 0, warnings: 2, suggestions: 1 })).toEqual({
      verdict: 'changes',
      grade: 'C',
    });
  });

  it('has none for an event recorded before verdicts without a score', () => {
    expect(outcomeOfReviewEvent({ score: null, blocking: 0, warnings: 0 })).toEqual({
      verdict: null,
      grade: null,
    });
  });
});

describe('latestOutcomeOf', () => {
  it('reads the latest review event only', () => {
    const mr = {
      reviews: [
        { verdict: 'ready', grade: 'A' },
        { verdict: null, grade: null },
      ],
    };

    expect(latestOutcomeOf(mr)).toEqual({ verdict: null, grade: null });
  });

  it('has none before any review', () => {
    expect(latestOutcomeOf({ reviews: [] })).toEqual({ verdict: null, grade: null });
  });
});

describe('gradeRank', () => {
  it('ranks A highest and E lowest', () => {
    expect((['A', 'B', 'C', 'D', 'E'] as const).map(gradeRank)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('qualityViewOf', () => {
  const mrWith = (...reviews: Array<Record<string, unknown>>) => ({ reviews });

  it('is unknown before any verdict', () => {
    expect(qualityViewOf(mrWith(), 'B')).toMatchObject({
      verdict: null,
      grade: null,
      state: 'unknown',
      trend: { direction: 'unknown', label: '' },
    });
  });

  it('is excellent when ready at the target grade or better', () => {
    expect(qualityViewOf(mrWith({ verdict: 'ready', grade: 'A' }), 'B')).toMatchObject({
      verdict: 'ready',
      grade: 'A',
      targetGrade: 'B',
      state: 'excellent',
    });
  });

  it('is a warning when ready below the target grade', () => {
    expect(qualityViewOf(mrWith({ verdict: 'ready', grade: 'B' }), 'A').state).toBe('warning');
  });

  it('is a warning when changes are asked on an important finding', () => {
    expect(qualityViewOf(mrWith({ verdict: 'changes', grade: 'C' }), 'B').state).toBe('warning');
  });

  it('is critical on a blocking finding or a review that did not finish', () => {
    expect(qualityViewOf(mrWith({ verdict: 'changes', grade: 'D' }), 'B').state).toBe('critical');
    expect(qualityViewOf(mrWith({ verdict: 'incomplete', grade: null }), 'B').state).toBe(
      'critical',
    );
  });

  it('compares the grades of the last two judged reviews', () => {
    const view = qualityViewOf(
      mrWith({ verdict: 'changes', grade: 'D' }, { verdict: 'changes', grade: 'C' }),
      'B',
    );

    expect(view.trend).toEqual({ direction: 'up', label: 'D → C' });
  });

  it('reports a drop and a flat trend', () => {
    expect(
      qualityViewOf(
        mrWith({ verdict: 'ready', grade: 'B' }, { verdict: 'changes', grade: 'C' }),
        'B',
      ).trend.direction,
    ).toBe('down');
    expect(
      qualityViewOf(mrWith({ verdict: 'ready', grade: 'B' }, { verdict: 'ready', grade: 'B' }), 'B')
        .trend,
    ).toEqual({ direction: 'flat', label: 'B → B' });
  });
});
