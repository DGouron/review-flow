import { describe, it, expect } from 'vitest';

import { getStatsSummary } from '@/modules/statistics-insights/services/statsService.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

describe('getStatsSummary', () => {
  it('exposes existing aggregates (totalReviews, durations, score, counts)', () => {
    const stats = ProjectStatsFactory.create({
      totalReviews: 5,
      totalDuration: 5 * 60_000,
      averageDuration: 60_000,
      averageScore: 7.5,
      totalBlocking: 3,
      totalWarnings: 4,
    });

    const summary = getStatsSummary(stats);

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

    const summary = getStatsSummary(stats);

    expect(summary.totalAdditions).toBe(150);
    expect(summary.totalDeletions).toBe(30);
    expect(summary.averageAdditions).toBe('75.0');
    expect(summary.averageDeletions).toBe('15.0');
    expect(summary.totalLinesReviewed).toBe(180);
  });

  it('formats diff averages as "-" when no review carries diffStats', () => {
    const stats = ProjectStatsFactory.create();

    const summary = getStatsSummary(stats);

    expect(summary.totalAdditions).toBe(0);
    expect(summary.totalDeletions).toBe(0);
    expect(summary.averageAdditions).toBe('-');
    expect(summary.averageDeletions).toBe('-');
    expect(summary.totalLinesReviewed).toBe(0);
  });
});
