import { describe, it, expect } from 'vitest';

import { StatsSummaryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const presenter = new StatsSummaryPresenter();

describe('StatsSummaryPresenter aggregates', () => {
  it('exposes existing aggregates (totalReviews, durations, readiness, counts)', () => {
    const stats = ProjectStatsFactory.create({
      totalReviews: 5,
      totalDuration: 5 * 60_000,
      averageDuration: 60_000,
      reviews: [
        ReviewStatsFactory.create({ id: 'a', verdict: 'ready', grade: 'B' }),
        ReviewStatsFactory.create({ id: 'b', verdict: 'changes', grade: 'C' }),
      ],
      totalBlocking: 3,
      totalWarnings: 4,
    });

    const summary = presenter.present(stats);

    expect(summary.totalReviews).toBe(5);
    expect(summary.readyRate).toBe('50%');
    expect(summary.grades).toEqual({ A: 0, B: 1, C: 1, D: 0, E: 0 });
    expect(summary.totalBlocking).toBe(3);
    expect(summary.totalWarnings).toBe(4);
    expect(summary.bugsDetected).toBe(7);
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

  it('renders readyRate as "-" when no review was judged', () => {
    const stats = ProjectStatsFactory.create({
      reviews: [ReviewStatsFactory.create({ id: 'a', score: null })],
    });

    expect(presenter.present(stats).readyRate).toBe('-');
  });

  it('reads a review recorded before verdicts through its counts', () => {
    const stats = ProjectStatsFactory.create({
      reviews: [
        ReviewStatsFactory.create({ id: 'a', score: 9, blocking: 0, warnings: 0 }),
        ReviewStatsFactory.create({ id: 'b', score: 6, blocking: 1, warnings: 0 }),
      ],
    });

    expect(presenter.present(stats).readyRate).toBe('50%');
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
  const reviewsOf = (prefix: string, verdict: 'ready' | 'changes', blocking: number, count = 5) =>
    Array.from({ length: count }, (_, index) =>
      ReviewStatsFactory.create({ id: `${prefix}${index}`, verdict, grade: 'B', blocking }),
    );

  it('keeps trends stable when there are too few reviews to compare', () => {
    const summary = presenter.present(
      ProjectStatsFactory.withReviews(reviewsOf('a', 'ready', 0, 2)),
    );

    expect(summary.trend.readiness).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });

  it('reports readiness up and blocking up when recent reviews improve', () => {
    const summary = presenter.present(
      ProjectStatsFactory.withReviews([
        ...reviewsOf('p', 'changes', 3),
        ...reviewsOf('r', 'ready', 0),
      ]),
    );

    expect(summary.trend.readiness).toBe('up');
    expect(summary.trend.blocking).toBe('up');
  });

  it('reports readiness down and blocking down when recent reviews worsen', () => {
    const summary = presenter.present(
      ProjectStatsFactory.withReviews([
        ...reviewsOf('p', 'ready', 0),
        ...reviewsOf('r', 'changes', 4),
      ]),
    );

    expect(summary.trend.readiness).toBe('down');
    expect(summary.trend.blocking).toBe('down');
  });

  it('keeps readiness stable when no review was judged in either window', () => {
    const unjudged = Array.from({ length: 10 }, (_, index) =>
      ReviewStatsFactory.create({ id: `u${index}`, score: null, blocking: 1 }),
    );

    const summary = presenter.present(ProjectStatsFactory.withReviews(unjudged));

    expect(summary.trend.readiness).toBe('stable');
  });

  it('keeps readiness stable when the share moves by less than ten points', () => {
    const summary = presenter.present(
      ProjectStatsFactory.withReviews([
        ...reviewsOf('p', 'ready', 1),
        ...reviewsOf('r', 'ready', 1),
      ]),
    );

    expect(summary.trend.readiness).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });
});

describe('StatsSummaryPresenter review period', () => {
  it('reports the first and last review dates with the day span', () => {
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({ id: 'a', timestamp: '2024-02-12T10:00:00Z' }),
      ReviewStatsFactory.create({ id: 'b', timestamp: '2024-06-23T10:00:00Z' }),
    ]);

    const summary = presenter.present(stats);

    expect(summary.period).toEqual({ from: '12 Feb 2024', to: '23 Jun 2024', days: 132 });
  });

  it('orders the period from earliest to latest regardless of review order', () => {
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({ id: 'late', timestamp: '2024-06-23T10:00:00Z' }),
      ReviewStatsFactory.create({ id: 'early', timestamp: '2024-02-12T10:00:00Z' }),
    ]);

    const summary = presenter.present(stats);

    expect(summary.period?.from).toBe('12 Feb 2024');
    expect(summary.period?.to).toBe('23 Jun 2024');
  });

  it('has no period when the project has no reviews', () => {
    const summary = presenter.present(ProjectStatsFactory.create());

    expect(summary.period).toBeNull();
  });
});
