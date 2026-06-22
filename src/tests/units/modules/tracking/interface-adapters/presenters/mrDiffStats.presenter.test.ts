import { describe, it, expect } from 'vitest';

import type { ReviewEvent } from '@/modules/tracking/entities/tracking/reviewEvent.js';
import { MrDiffStatsPresenter } from '@/modules/tracking/interface-adapters/presenters/mrDiffStats.presenter.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';

function reviewEvent(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    type: 'review',
    timestamp: '2024-01-15T10:00:00Z',
    durationMs: 60000,
    score: 8,
    blocking: 0,
    warnings: 0,
    suggestions: 0,
    threadsClosed: 0,
    threadsOpened: 0,
    diffStats: null,
    ...overrides,
  };
}

describe('attachDiffStatsToMrs', () => {
  it('attaches the matching MR diff stats from project stats onto the latest review event', () => {
    const mrs = [TrackedMrFactory.create({ id: 'mr-1', mrNumber: 5438, reviews: [reviewEvent()] })];
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({
        mrNumber: 5438,
        diffStats: { commitsCount: 3, additions: 120, deletions: 40 },
      }),
    ]);

    const [enriched] = new MrDiffStatsPresenter().present(mrs, stats);

    expect(enriched.reviews.at(-1)?.diffStats).toEqual({
      commitsCount: 3,
      additions: 120,
      deletions: 40,
    });
  });

  it('uses the most recent diff stats when an MR has several review entries', () => {
    const mrs = [TrackedMrFactory.create({ mrNumber: 7, reviews: [reviewEvent()] })];
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({
        id: 'older',
        mrNumber: 7,
        diffStats: { commitsCount: 1, additions: 10, deletions: 5 },
      }),
      ReviewStatsFactory.create({
        id: 'newer',
        mrNumber: 7,
        diffStats: { commitsCount: 2, additions: 99, deletions: 8 },
      }),
    ]);

    const [enriched] = new MrDiffStatsPresenter().present(mrs, stats);

    expect(enriched.reviews.at(-1)?.diffStats).toEqual({
      commitsCount: 2,
      additions: 99,
      deletions: 8,
    });
  });

  it('leaves an MR untouched when no matching diff stats exist (older than the retained window)', () => {
    const mrs = [TrackedMrFactory.create({ mrNumber: 999, reviews: [reviewEvent()] })];
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({
        mrNumber: 1,
        diffStats: { commitsCount: 1, additions: 10, deletions: 5 },
      }),
    ]);

    const [enriched] = new MrDiffStatsPresenter().present(mrs, stats);

    expect(enriched.reviews.at(-1)?.diffStats).toBeNull();
  });

  it('returns the MRs unchanged when project stats are absent', () => {
    const mrs = [TrackedMrFactory.create({ mrNumber: 5438, reviews: [reviewEvent()] })];

    expect(new MrDiffStatsPresenter().present(mrs, null)).toBe(mrs);
  });

  it('does not crash on an MR with no review events', () => {
    const mrs = [TrackedMrFactory.create({ mrNumber: 5438, reviews: [] })];
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({
        mrNumber: 5438,
        diffStats: { commitsCount: 3, additions: 120, deletions: 40 },
      }),
    ]);

    const [enriched] = new MrDiffStatsPresenter().present(mrs, stats);

    expect(enriched.reviews).toEqual([]);
  });
});
