import { describe, it, expect } from 'vitest';

import { AnalyticsHeaderPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const NOW = new Date('2024-12-15T12:00:00Z');

const present = (stats = ProjectStatsFactory.create(), now = NOW) =>
  new AnalyticsHeaderPresenter().present(stats, now);

describe('AnalyticsHeaderPresenter', () => {
  it('exposes PRs Reviewed as the total review count', () => {
    const viewModel = present(ProjectStatsFactory.create({ totalReviews: 43 }));

    expect(viewModel.prsReviewed.labelKey).toBe('stats.kpi.prsReviewed');
    expect(viewModel.prsReviewed.value).toBe(43);
  });

  it('counts Bugs Caught as blocking plus important, suggestions excluded', () => {
    const viewModel = present(
      ProjectStatsFactory.create({ totalReviews: 5, totalBlocking: 3, totalWarnings: 5 }),
    );

    expect(viewModel.bugsCaught.labelKey).toBe('stats.kpi.bugsCaught');
    expect(viewModel.bugsCaught.value).toBe(8);
  });

  it('formats Average Review Time human-readable', () => {
    const viewModel = present(
      ProjectStatsFactory.create({ totalReviews: 1, averageDuration: 4320000 }),
    );

    expect(viewModel.averageReviewTime.labelKey).toBe('stats.kpi.averageReviewTime');
    expect(viewModel.averageReviewTime.value).toBe('1h 12m');
  });

  it('produces the trailing twelve-month review volume series', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'a', timestamp: '2024-01-10T10:00:00Z' }),
      ReviewStatsFactory.create({ id: 'b', timestamp: '2024-12-01T10:00:00Z' }),
    ];

    const viewModel = present(ProjectStatsFactory.withReviews(reviews));

    expect(viewModel.reviewsPerMonth).toHaveLength(12);
    const byMonth = new Map(viewModel.reviewsPerMonth.map((point) => [point.month, point.count]));
    expect(byMonth.get('2024-01')).toBe(1);
    expect(byMonth.get('2024-12')).toBe(1);
  });

  it('hides every KPI delta in v1', () => {
    const viewModel = present(
      ProjectStatsFactory.withReviews([ReviewStatsFactory.create({ id: 'only' })]),
    );

    expect(viewModel.prsReviewed.delta).toBeNull();
    expect(viewModel.bugsCaught.delta).toBeNull();
    expect(viewModel.averageReviewTime.delta).toBeNull();
  });

  it('flags the empty state with the French message when there are no reviews', () => {
    const viewModel = present(ProjectStatsFactory.create());

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.emptyMessage).toBe('Aucune review enregistrée');
  });

  it('is not empty when the project has at least one review', () => {
    const viewModel = present(ProjectStatsFactory.create({ totalReviews: 1 }));

    expect(viewModel.isEmpty).toBe(false);
  });
});
