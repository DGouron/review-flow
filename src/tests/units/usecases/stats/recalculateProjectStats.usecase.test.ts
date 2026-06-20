import { describe, it, expect } from 'vitest';

import { recalculateProjectStats } from '@/modules/statistics-insights/usecases/stats/recalculateProjectStats.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

describe('recalculateProjectStats', () => {
  it('should recalculate averageScore correctly from reviews', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', score: 6, mrNumber: 1 }),
      ReviewStatsFactory.create({ id: 'r2', score: 8, mrNumber: 2 }),
      ReviewStatsFactory.create({ id: 'r3', score: 10, mrNumber: 3 }),
    ];
    const projectStats = ProjectStatsFactory.create({
      reviews,
      averageScore: 0,
      totalReviews: 0,
    });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.averageScore).toBe(8);
    expect(result.totalReviews).toBe(3);
  });

  it('should exclude reviews with null scores from average', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', score: 6, mrNumber: 1 }),
      ReviewStatsFactory.create({ id: 'r2', score: null, mrNumber: 2 }),
      ReviewStatsFactory.create({ id: 'r3', score: 10, mrNumber: 3 }),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.averageScore).toBe(8);
  });

  it('should compute diff stat aggregates from reviews with diffStats', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 2, additions: 100, deletions: 20 },
        { id: 'r1', mrNumber: 1 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 50, deletions: 10 },
        { id: 'r2', mrNumber: 2 },
      ),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.totalAdditions).toBe(150);
    expect(result.totalDeletions).toBe(30);
    expect(result.averageAdditions).toBe(75);
    expect(result.averageDeletions).toBe(15);
    expect(result.diffStatsReviewCount).toBe(2);
  });

  it('should exclude null diffStats from averages', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 2, additions: 100, deletions: 20 },
        { id: 'r1', mrNumber: 1 },
      ),
      ReviewStatsFactory.create({ id: 'r2', mrNumber: 2, diffStats: null }),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 50, deletions: 10 },
        { id: 'r3', mrNumber: 3 },
      ),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.totalAdditions).toBe(150);
    expect(result.totalDeletions).toBe(30);
    expect(result.averageAdditions).toBe(75);
    expect(result.averageDeletions).toBe(15);
    expect(result.diffStatsReviewCount).toBe(2);
  });

  it('should handle empty reviews array', () => {
    const statsGateway = new InMemoryStatsGateway();
    const projectStats = ProjectStatsFactory.create({ reviews: [] });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.totalReviews).toBe(0);
    expect(result.averageScore).toBeNull();
    expect(result.totalDuration).toBe(0);
    expect(result.averageDuration).toBe(0);
    expect(result.totalBlocking).toBe(0);
    expect(result.totalWarnings).toBe(0);
    expect(result.totalAdditions).toBe(0);
    expect(result.totalDeletions).toBe(0);
    expect(result.averageAdditions).toBe(0);
    expect(result.averageDeletions).toBe(0);
    expect(result.diffStatsReviewCount).toBe(0);
  });

  it('should recalculate totalDuration and averageDuration', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', duration: 60000, mrNumber: 1 }),
      ReviewStatsFactory.create({ id: 'r2', duration: 120000, mrNumber: 2 }),
    ];
    const projectStats = ProjectStatsFactory.create({
      reviews,
      totalDuration: 0,
      averageDuration: 0,
    });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.totalDuration).toBe(180000);
    expect(result.averageDuration).toBe(90000);
  });

  it('should recalculate totalBlocking and totalWarnings', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', blocking: 2, warnings: 3, mrNumber: 1 }),
      ReviewStatsFactory.create({ id: 'r2', blocking: 1, warnings: 4, mrNumber: 2 }),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = recalculateProjectStats('/test/project', {
      statsGateway,
    });

    expect(result.totalBlocking).toBe(3);
    expect(result.totalWarnings).toBe(7);
  });

  it('should save the recalculated stats', () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [ReviewStatsFactory.create({ id: 'r1', score: 7, mrNumber: 1 })];
    const projectStats = ProjectStatsFactory.create({ reviews, averageScore: 0 });
    statsGateway.saveProjectStats('/test/project', projectStats);

    recalculateProjectStats('/test/project', { statsGateway });

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved?.averageScore).toBe(7);
  });
});
