import { describe, it, expect } from 'vitest';

import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { KeyInsightsPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const NOW = new Date('2024-12-15T12:00:00Z');

const daysBefore = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const reviewAt = (id: string, daysAgo: number, overrides: Partial<ReviewStats> = {}): ReviewStats =>
  ReviewStatsFactory.create({ id, timestamp: daysBefore(daysAgo), ...overrides });

const allThreeCandidates = () => {
  const earlyRecent = Array.from({ length: 7 }, (_, index) =>
    reviewAt(`recent-early-${index}`, 6, { duration: 300000 }),
  );
  const previous = Array.from({ length: 6 }, (_, index) =>
    reviewAt(`previous-${index}`, 40, { duration: 300000 }),
  );
  const lateRecent = Array.from({ length: 5 }, (_, index) =>
    reviewAt(`recent-late-${index}`, 5, { duration: 180000 }),
  );
  return {
    ...ProjectStatsFactory.withReviews([...previous, ...earlyRecent, ...lateRecent]),
    categoryBreakdown: {
      security: 1,
      logic: 2,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    },
  };
};

describe('KeyInsightsPresenter', () => {
  it('presents one card per derived insight, ordered most-notable first', () => {
    const viewModel = new KeyInsightsPresenter().present(allThreeCandidates(), NOW);

    expect(viewModel.cards.length).toBe(3);
    expect(viewModel.isEmpty).toBe(false);
    viewModel.cards.forEach((card) => {
      expect(typeof card.title).toBe('string');
      expect(typeof card.body).toBe('string');
    });
  });

  it('exposes only title and body on each card', () => {
    const viewModel = new KeyInsightsPresenter().present(allThreeCandidates(), NOW);

    expect(Object.keys(viewModel.cards[0]).toSorted()).toEqual(['body', 'title']);
  });

  it('presents a single card when only one candidate qualifies', () => {
    const stats = ProjectStatsFactory.create({
      categoryBreakdown: {
        security: 0,
        logic: 3,
        performance: 0,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      },
    });

    const viewModel = new KeyInsightsPresenter().present(stats, NOW);

    expect(viewModel.cards.length).toBe(1);
    expect(viewModel.cards[0].title).toContain('Logic');
  });

  it('flags the empty state with the French message when no candidate qualifies', () => {
    const viewModel = new KeyInsightsPresenter().present(ProjectStatsFactory.create(), NOW);

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.cards).toEqual([]);
    expect(viewModel.emptyMessage).toBe('Aucun insight disponible pour le moment');
  });
});
