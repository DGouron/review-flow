import { describe, it, expect } from 'vitest';

import { deriveKeyInsights } from '@/modules/statistics-insights/entities/stats/keyInsights.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const NOW = new Date('2024-12-15T12:00:00Z');

const daysBefore = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const reviewAt = (id: string, daysAgo: number, overrides: Partial<ReviewStats> = {}): ReviewStats =>
  ReviewStatsFactory.create({ id, timestamp: daysBefore(daysAgo), ...overrides });

describe('deriveKeyInsights', () => {
  it('returns no insight when the project has no reviews', () => {
    const insights = deriveKeyInsights(ProjectStatsFactory.create(), NOW);

    expect(insights).toEqual([]);
  });

  describe('dominant bug category candidate', () => {
    it('names the category with the most findings and its count', () => {
      const stats = ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 4,
          logic: 12,
          performance: 0,
          typeSafety: 0,
          style: 2,
          dependencies: 0,
        },
      });

      const insights = deriveKeyInsights(stats, NOW);
      const category = insights.find((insight) => insight.key === 'dominantCategory');

      expect(category).toBeDefined();
      expect(category?.title).toContain('Logic');
      expect(category?.body).toContain('12');
    });

    it('breaks a tie by the canonical category order', () => {
      const stats = ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 5,
          logic: 5,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      });

      const category = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'dominantCategory',
      );

      expect(category?.title).toContain('Security');
    });

    it('omits the candidate when there is no breakdown', () => {
      const insights = deriveKeyInsights(ProjectStatsFactory.create(), NOW);

      expect(insights.find((insight) => insight.key === 'dominantCategory')).toBeUndefined();
    });

    it('omits the candidate when every category count is zero', () => {
      const stats = ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 0,
          logic: 0,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      });

      const category = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'dominantCategory',
      );

      expect(category).toBeUndefined();
    });
  });

  describe('average-review-time trend candidate', () => {
    const timedReviews = (recentMs: number, previousMs: number, count: number): ReviewStats[] => {
      const previous = Array.from({ length: count }, (_, index) =>
        reviewAt(`previous-${index}`, 40, { duration: previousMs }),
      );
      const recent = Array.from({ length: count }, (_, index) =>
        reviewAt(`recent-${index}`, 5, { duration: recentMs }),
      );
      return [...previous, ...recent];
    };

    it('states a drop when the recent average falls below the previous period', () => {
      const stats = ProjectStatsFactory.withReviews(timedReviews(180000, 300000, 5));

      const time = deriveKeyInsights(stats, NOW).find((insight) => insight.key === 'reviewTime');

      expect(time).toBeDefined();
      expect(time?.title).toMatch(/time/i);
      expect(time?.body).toContain('-40%');
    });

    it('states a rise when the recent average climbs above the previous period', () => {
      const stats = ProjectStatsFactory.withReviews(timedReviews(300000, 180000, 5));

      const time = deriveKeyInsights(stats, NOW).find((insight) => insight.key === 'reviewTime');

      expect(time?.body).toContain('+67%');
    });

    it('omits the candidate when a window has fewer than the minimum samples', () => {
      const stats = ProjectStatsFactory.withReviews(timedReviews(180000, 300000, 2));

      const time = deriveKeyInsights(stats, NOW).find((insight) => insight.key === 'reviewTime');

      expect(time).toBeUndefined();
    });

    it('omits the candidate when the previous average is zero (no division by zero)', () => {
      const stats = ProjectStatsFactory.withReviews(timedReviews(180000, 0, 5));

      const time = deriveKeyInsights(stats, NOW).find((insight) => insight.key === 'reviewTime');

      expect(time).toBeUndefined();
    });

    it('omits the candidate when the relative change is below the ten percent floor', () => {
      const stats = ProjectStatsFactory.withReviews(timedReviews(295000, 300000, 5));

      const time = deriveKeyInsights(stats, NOW).find((insight) => insight.key === 'reviewTime');

      expect(time).toBeUndefined();
    });
  });

  describe('review-volume trend candidate', () => {
    const volumeReviews = (recentCount: number, previousCount: number): ReviewStats[] => {
      const previous = Array.from({ length: previousCount }, (_, index) =>
        reviewAt(`previous-${index}`, 40),
      );
      const recent = Array.from({ length: recentCount }, (_, index) =>
        reviewAt(`recent-${index}`, 5),
      );
      return [...previous, ...recent];
    };

    it('states the increase with magnitude when the recent period has more reviews', () => {
      const stats = ProjectStatsFactory.withReviews(volumeReviews(12, 6));

      const volume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'reviewVolume',
      );

      expect(volume).toBeDefined();
      expect(volume?.title).toMatch(/volume/i);
      expect(volume?.body).toContain('12');
      expect(volume?.body).toContain('6');
      expect(volume?.body).toContain('+100%');
    });

    it('states the decrease when the recent period has fewer reviews', () => {
      const stats = ProjectStatsFactory.withReviews(volumeReviews(3, 6));

      const volume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'reviewVolume',
      );

      expect(volume?.body).toContain('-50%');
    });

    it('omits the candidate when a period has fewer than the minimum samples', () => {
      const stats = ProjectStatsFactory.withReviews(volumeReviews(12, 2));

      const volume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'reviewVolume',
      );

      expect(volume).toBeUndefined();
    });

    it('omits the candidate when the previous period has no reviews (no division by zero)', () => {
      const recent = Array.from({ length: 12 }, (_, index) => reviewAt(`recent-${index}`, 5));
      const stats = ProjectStatsFactory.withReviews(recent);

      const volume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'reviewVolume',
      );

      expect(volume).toBeUndefined();
    });

    it('omits the candidate when the relative change is below the ten percent floor', () => {
      const stats = ProjectStatsFactory.withReviews(volumeReviews(11, 12));

      const volume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'reviewVolume',
      );

      expect(volume).toBeUndefined();
    });
  });

  describe('ranking', () => {
    it('orders the insights by strength descending', () => {
      const recent = Array.from({ length: 12 }, (_, index) =>
        reviewAt(`recent-${index}`, 5, { duration: 180000 }),
      );
      const previous = Array.from({ length: 6 }, (_, index) =>
        reviewAt(`previous-${index}`, 40, { duration: 300000 }),
      );
      const stats = {
        ...ProjectStatsFactory.withReviews([...previous, ...recent]),
        categoryBreakdown: {
          security: 1,
          logic: 2,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      };

      const insights = deriveKeyInsights(stats, NOW);
      const strengths = insights.map((insight) => insight.strength);

      expect(insights.length).toBeGreaterThan(1);
      expect(strengths).toEqual([...strengths].toSorted((left, right) => right - left));
    });
  });

  describe('code-volume always-on candidate', () => {
    const diffReview = (id: string, additions: number, deletions: number, commitsCount: number) =>
      ReviewStatsFactory.withDiffStats(
        DiffStatsFactory.create({ additions, deletions, commitsCount }),
        { id },
      );

    it('reports a substantial-volume assessment when the average changeset is large', () => {
      const stats = ProjectStatsFactory.withReviews([
        diffReview('a', 150, 60, 4),
        diffReview('b', 150, 60, 2),
      ]);

      const codeVolume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'codeVolume',
      );

      expect(codeVolume).toBeDefined();
      expect(codeVolume?.title).toBe('Substantial code volume');
      expect(codeVolume?.body).toContain('420 lines');
      expect(codeVolume?.body).toContain('6 commits');
      expect(codeVolume?.body).toContain('avg 210 lines');
      expect(codeVolume?.body).toContain('3.0 commits/MR');
    });

    it('reports a lean assessment when the average changeset is small', () => {
      const stats = ProjectStatsFactory.withReviews([
        diffReview('a', 50, 20, 1),
        diffReview('b', 50, 20, 1),
      ]);

      const codeVolume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'codeVolume',
      );

      expect(codeVolume?.title).toBe('Lean changesets');
    });

    it('pins the code-volume card first, ahead of ranked trend candidates', () => {
      const stats = {
        ...ProjectStatsFactory.withReviews([
          diffReview('a', 150, 60, 3),
          diffReview('b', 150, 60, 3),
        ]),
        categoryBreakdown: {
          security: 0,
          logic: 5,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      };

      const insights = deriveKeyInsights(stats, NOW);

      expect(insights.length).toBeGreaterThan(1);
      expect(insights[0].key).toBe('codeVolume');
    });

    it('omits the candidate when no review carries diff data', () => {
      const stats = ProjectStatsFactory.withReviews([reviewAt('a', 5), reviewAt('b', 6)]);

      const codeVolume = deriveKeyInsights(stats, NOW).find(
        (insight) => insight.key === 'codeVolume',
      );

      expect(codeVolume).toBeUndefined();
    });
  });
});
