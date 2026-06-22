import { describe, it, expect } from 'vitest';

import { StatsSummaryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const presenter = new StatsSummaryPresenter();

describe('StatsSummaryPresenter aggregates', () => {
  it('exposes existing aggregates (totalReviews, durations, score, counts)', () => {
    const stats = ProjectStatsFactory.create({
      totalReviews: 5,
      totalDuration: 5 * 60_000,
      averageDuration: 60_000,
      averageScore: 7.5,
      totalBlocking: 3,
      totalWarnings: 4,
    });

    const summary = presenter.present(stats);

    expect(summary.totalReviews).toBe(5);
    expect(summary.averageScore).toBe('7.5');
    expect(summary.totalBlocking).toBe(3);
    expect(summary.totalWarnings).toBe(4);
  });

  it('includes diff aggregates when reviews carry diffStats', () => {
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.withDiffStats(DiffStatsFactory.create({ additions: 100, deletions: 20 })),
      ReviewStatsFactory.withDiffStats(DiffStatsFactory.create({ additions: 50, deletions: 10 })),
    ]);

    const summary = presenter.present(stats);

    expect(summary.totalAdditions).toBe(150);
    expect(summary.totalDeletions).toBe(30);
    expect(summary.totalCommits).toBe(6);
    expect(summary.averageAdditions).toBe('75.0');
    expect(summary.averageDeletions).toBe('15.0');
    expect(summary.averageCommits).toBe('3.0');
    expect(summary.totalLinesReviewed).toBe(180);
  });

  it('formats diff averages as "-" when no review carries diffStats', () => {
    const summary = presenter.present(ProjectStatsFactory.create());

    expect(summary.averageAdditions).toBe('-');
    expect(summary.averageDeletions).toBe('-');
    expect(summary.averageCommits).toBe('-');
    expect(summary.totalCommits).toBe(0);
    expect(summary.totalLinesReviewed).toBe(0);
  });

  it('renders averageScore as "-" when it is null', () => {
    const summary = presenter.present(ProjectStatsFactory.create({ averageScore: null }));

    expect(summary.averageScore).toBe('-');
  });
});

describe('StatsSummaryPresenter duration formatting', () => {
  it('formats durations including hours when above one hour', () => {
    const summary = presenter.present(
      ProjectStatsFactory.create({
        totalDuration: 3 * 3600000 + 25 * 60000,
        averageDuration: 90 * 60000,
      }),
    );

    expect(summary.totalTime).toBe('3h 25m');
    expect(summary.averageTime).toBe('1h 30m');
  });

  it('formats durations as minutes only when below one hour', () => {
    const summary = presenter.present(
      ProjectStatsFactory.create({ totalDuration: 45 * 60000, averageDuration: 45 * 60000 }),
    );

    expect(summary.totalTime).toBe('45m');
    expect(summary.averageTime).toBe('45m');
  });
});

describe('StatsSummaryPresenter trends', () => {
  it('keeps trends stable when there are too few reviews to compare', () => {
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({ id: 'a', score: 8, blocking: 0 }),
      ReviewStatsFactory.create({ id: 'b', score: 8, blocking: 0 }),
    ]);

    const summary = presenter.present(stats);

    expect(summary.trend.score).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });

  it('reports score up and blocking up when recent reviews improve', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: 5, blocking: 3 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: 9, blocking: 0 }),
    );
    const summary = presenter.present(ProjectStatsFactory.withReviews([...previous, ...recent]));

    expect(summary.trend.score).toBe('up');
    expect(summary.trend.blocking).toBe('up');
  });

  it('reports score down and blocking down when recent reviews worsen', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: 9, blocking: 0 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: 5, blocking: 4 }),
    );
    const summary = presenter.present(ProjectStatsFactory.withReviews([...previous, ...recent]));

    expect(summary.trend.score).toBe('down');
    expect(summary.trend.blocking).toBe('down');
  });

  it('keeps score trend stable when no scored reviews exist in either window', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: null, blocking: 1 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: null, blocking: 1 }),
    );
    const summary = presenter.present(ProjectStatsFactory.withReviews([...previous, ...recent]));

    expect(summary.trend.score).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });

  it('keeps score trend stable when changes stay within the threshold', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: 7, blocking: 1 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: 7.2, blocking: 1 }),
    );
    const summary = presenter.present(ProjectStatsFactory.withReviews([...previous, ...recent]));

    expect(summary.trend.score).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });
});
