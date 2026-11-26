import { describe, expect, it } from 'vitest';

import { latestReviewOutcomeOf } from '@/modules/tracking/entities/tracking/latestReviewOutcome.js';
import type { ReviewEvent } from '@/modules/tracking/entities/tracking/reviewEvent.js';
import { ReviewEventFactory } from '@/tests/factories/reviewEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';

describe('latestReviewOutcomeOf', () => {
  it('has no outcome before any review', () => {
    const mr = TrackedMrFactory.create({ reviews: [] });

    expect(latestReviewOutcomeOf(mr)).toEqual({ verdict: null, grade: null });
  });

  it('reads the verdict and the grade of the latest review', () => {
    const mr = TrackedMrFactory.create({
      reviews: [
        ReviewEventFactory.create({ verdict: 'changes', grade: 'C' }),
        ReviewEventFactory.create({ type: 'followup', verdict: 'ready', grade: 'B' }),
      ],
    });

    expect(latestReviewOutcomeOf(mr)).toEqual({ verdict: 'ready', grade: 'B' });
  });

  it('never falls back to an older review when the latest gave no verdict', () => {
    const mr = TrackedMrFactory.create({
      reviews: [
        ReviewEventFactory.create({ verdict: 'ready', grade: 'A' }),
        ReviewEventFactory.create({ score: null }),
      ],
    });

    expect(latestReviewOutcomeOf(mr)).toEqual({ verdict: null, grade: null });
  });

  it('rebuilds the outcome of a review recorded before verdicts from its counts', () => {
    const legacy: ReviewEvent = ReviewEventFactory.create({
      score: 8,
      warnings: 1,
      suggestions: 2,
    });
    delete legacy.verdict;
    delete legacy.grade;
    const mr = TrackedMrFactory.create({ reviews: [legacy] });

    expect(latestReviewOutcomeOf(mr)).toEqual({ verdict: 'changes', grade: 'C' });
  });

  it('gives no outcome to a review recorded before verdicts without a score', () => {
    const legacy: ReviewEvent = ReviewEventFactory.create({ score: null });
    delete legacy.verdict;
    delete legacy.grade;
    const mr = TrackedMrFactory.create({ reviews: [legacy] });

    expect(latestReviewOutcomeOf(mr)).toEqual({ verdict: null, grade: null });
  });
});
