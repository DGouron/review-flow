import { describe, it, expect } from 'vitest';

import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

describe('StatsService DiffStats', () => {
  describe('ReviewStats', () => {
    it('should support diffStats field with additions, deletions, and commitsCount', () => {
      const diffStats = DiffStatsFactory.create();
      const reviewStats = ReviewStatsFactory.create({ diffStats });

      expect(reviewStats.diffStats).toEqual({
        commitsCount: 3,
        additions: 150,
        deletions: 30,
      });
    });

    it('should support null diffStats for reviews without diff data', () => {
      const reviewStats = ReviewStatsFactory.create({ diffStats: null });

      expect(reviewStats.diffStats).toBeNull();
    });
  });

  describe('ProjectStats', () => {
    it('should include totalAdditions and totalDeletions aggregates', () => {
      const stats = ProjectStatsFactory.create();

      expect(stats.totalAdditions).toBe(0);
      expect(stats.totalDeletions).toBe(0);
    });

    it('should include averageAdditions and averageDeletions', () => {
      const stats = ProjectStatsFactory.create();

      expect(stats.averageAdditions).toBeNull();
      expect(stats.averageDeletions).toBeNull();
    });

    it('should compute aggregates from reviews with diffStats', () => {
      const reviews: ReviewStats[] = [
        ReviewStatsFactory.create({
          diffStats: DiffStatsFactory.create({ additions: 100, deletions: 20 }),
        }),
        ReviewStatsFactory.create({
          diffStats: DiffStatsFactory.create({ additions: 200, deletions: 40 }),
        }),
        ReviewStatsFactory.create({
          diffStats: null,
        }),
      ];

      const stats = ProjectStatsFactory.withReviews(reviews);

      expect(stats.totalAdditions).toBe(300);
      expect(stats.totalDeletions).toBe(60);
      expect(stats.averageAdditions).toBe(150);
      expect(stats.averageDeletions).toBe(30);
    });

    it('should return null averages when no reviews have diffStats', () => {
      const reviews: ReviewStats[] = [ReviewStatsFactory.create({ diffStats: null })];

      const stats = ProjectStatsFactory.withReviews(reviews);

      expect(stats.totalAdditions).toBe(0);
      expect(stats.totalDeletions).toBe(0);
      expect(stats.averageAdditions).toBeNull();
      expect(stats.averageDeletions).toBeNull();
    });
  });
});
