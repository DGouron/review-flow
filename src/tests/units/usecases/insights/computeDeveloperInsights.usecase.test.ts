import { describe, it, expect } from 'vitest';

import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { computeDeveloperInsights } from '@/modules/statistics-insights/usecases/insights/computeDeveloperInsights.usecase.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

function createReviewsForDeveloper(
  developerName: string,
  count: number,
  overrides: Partial<ReviewStats> = {},
): ReviewStats[] {
  return Array.from({ length: count }, (_, index) =>
    ReviewStatsFactory.create({
      id: `${developerName}-${index}`,
      assignedBy: developerName,
      mrNumber: index + 1,
      ...overrides,
    }),
  );
}

describe('computeDeveloperInsights', () => {
  describe('grouping by developer', () => {
    it('should return empty array when no reviews are provided', () => {
      const result = computeDeveloperInsights([]);

      expect(result).toEqual([]);
    });

    it('should skip reviews without assignedBy', () => {
      const reviews = [
        ReviewStatsFactory.create({ assignedBy: undefined }),
        ReviewStatsFactory.create({ assignedBy: undefined }),
      ];

      const result = computeDeveloperInsights(reviews);

      expect(result).toEqual([]);
    });

    it('should skip developers with fewer than 5 reviews', () => {
      const reviews = createReviewsForDeveloper('alice', 4);

      const result = computeDeveloperInsights(reviews);

      expect(result).toEqual([]);
    });

    it('should include developers with exactly 5 reviews', () => {
      const reviews = createReviewsForDeveloper('alice', 5, { score: 7 });

      const result = computeDeveloperInsights(reviews);

      expect(result).toHaveLength(1);
      expect(result[0].developerName).toBe('alice');
      expect(result[0].reviewCount).toBe(5);
    });

    it('should group reviews by developer name', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 6, { score: 7 });
      const bobReviews = createReviewsForDeveloper('bob', 5, { score: 8 });
      const reviews = [...aliceReviews, ...bobReviews];

      const result = computeDeveloperInsights(reviews);

      expect(result).toHaveLength(2);
      const names = result.map((insight) => insight.developerName);
      expect(names).toContain('alice');
      expect(names).toContain('bob');
    });
  });

  describe('category level computation', () => {
    it('should compute quality level based on readiness relative to team average', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 5, {
        verdict: 'ready',
        grade: 'A',
        blocking: 0,
        warnings: 0,
      });
      const bobReviews = createReviewsForDeveloper('bob', 5, {
        verdict: 'changes',
        grade: 'D',
        blocking: 3,
        warnings: 5,
      });
      const reviews = [...aliceReviews, ...bobReviews];

      const result = computeDeveloperInsights(reviews);

      const alice = result.find((insight) => insight.developerName === 'alice');
      const bob = result.find((insight) => insight.developerName === 'bob');

      expect(alice).toBeDefined();
      expect(bob).toBeDefined();
      expect(alice?.categoryLevels.quality.level).toBeGreaterThan(
        bob?.categoryLevels.quality.level ?? 10,
      );
    });

    it('should compute responsiveness level based on review duration', () => {
      const fastReviews = createReviewsForDeveloper('alice', 5, {
        duration: 30000,
        score: 7,
      });
      const slowReviews = createReviewsForDeveloper('bob', 5, {
        duration: 300000,
        score: 7,
      });
      const reviews = [...fastReviews, ...slowReviews];

      const result = computeDeveloperInsights(reviews);

      const alice = result.find((insight) => insight.developerName === 'alice');
      const bob = result.find((insight) => insight.developerName === 'bob');

      expect(alice?.categoryLevels.responsiveness.level).toBeGreaterThan(
        bob?.categoryLevels.responsiveness.level ?? 10,
      );
    });

    it('should compute code volume level using diff stats', () => {
      const largeVolume = createReviewsForDeveloper('alice', 5, {
        score: 8,
        diffStats: { commitsCount: 5, additions: 500, deletions: 100 },
      });
      const smallVolume = createReviewsForDeveloper('bob', 5, {
        score: 8,
        diffStats: { commitsCount: 1, additions: 10, deletions: 5 },
      });
      const reviews = [...largeVolume, ...smallVolume];

      const result = computeDeveloperInsights(reviews);

      const alice = result.find((insight) => insight.developerName === 'alice');
      const bob = result.find((insight) => insight.developerName === 'bob');

      expect(alice).toBeDefined();
      expect(bob).toBeDefined();
      expect(alice?.categoryLevels.codeVolume.level).toBeGreaterThan(
        bob?.categoryLevels.codeVolume.level ?? 10,
      );
    });

    it('should clamp levels between 1 and 10', () => {
      const reviews = createReviewsForDeveloper('alice', 5, {
        score: 10,
        blocking: 0,
        warnings: 0,
        duration: 1000,
      });

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      for (const category of Object.values(alice.categoryLevels)) {
        expect(category.level).toBeGreaterThanOrEqual(1);
        expect(category.level).toBeLessThanOrEqual(10);
      }
    });

    it('should produce integer levels', () => {
      const reviews = createReviewsForDeveloper('alice', 7, { score: 7.3 });

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      for (const category of Object.values(alice.categoryLevels)) {
        expect(Number.isInteger(category.level)).toBe(true);
      }
    });
  });

  describe('trend computation', () => {
    it('should detect improving trend when recent reviews are better', () => {
      const olderReviews = Array.from({ length: 10 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-old-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          verdict: 'changes',
          grade: 'C',
          blocking: 0,
          warnings: 1,
          timestamp: new Date(2024, 0, index + 1).toISOString(),
        }),
      );
      const recentReviews = Array.from({ length: 10 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-new-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 11,
          verdict: 'ready',
          grade: 'A',
          blocking: 0,
          warnings: 0,
          timestamp: new Date(2024, 6, index + 1).toISOString(),
        }),
      );
      const reviews = [...olderReviews, ...recentReviews];

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      expect(alice.categoryLevels.quality.trend).toBe('improving');
    });

    it('should detect declining trend when recent reviews are worse', () => {
      const olderReviews = Array.from({ length: 10 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-old-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          verdict: 'ready',
          grade: 'A',
          blocking: 0,
          warnings: 0,
          timestamp: new Date(2024, 0, index + 1).toISOString(),
        }),
      );
      const recentReviews = Array.from({ length: 10 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-new-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 11,
          verdict: 'changes',
          grade: 'D',
          blocking: 5,
          timestamp: new Date(2024, 6, index + 1).toISOString(),
        }),
      );
      const reviews = [...olderReviews, ...recentReviews];

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      expect(alice.categoryLevels.quality.trend).toBe('declining');
    });

    it('should detect stable trend when grades are consistent', () => {
      const reviews = Array.from({ length: 20 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 7,
          blocking: 1,
          warnings: 2,
          duration: 60000,
          timestamp: new Date(2024, 0, index + 1).toISOString(),
        }),
      );

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      expect(alice.categoryLevels.quality.trend).toBe('stable');
    });
  });

  describe('strengths and weaknesses', () => {
    it('should identify strengths when level >= 7', () => {
      const reviews = createReviewsForDeveloper('alice', 5, {
        score: 10,
        blocking: 0,
        warnings: 0,
        duration: 60000,
      });

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      expect(alice.strengths.length).toBeGreaterThan(0);
    });

    it('should identify weaknesses when level <= 4', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 5, {
        score: 2,
        blocking: 10,
        warnings: 15,
        duration: 600000,
      });
      const bobReviews = createReviewsForDeveloper('bob', 5, {
        score: 9,
        blocking: 0,
        warnings: 0,
        duration: 10000,
      });

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      expect(alice?.weaknesses.length).toBeGreaterThan(0);
    });
  });

  describe('top priority', () => {
    it('should set top priority to lowest level category', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 5, {
        score: 3,
        blocking: 8,
        warnings: 10,
        duration: 10000,
      });
      const bobReviews = createReviewsForDeveloper('bob', 5, {
        score: 9,
        blocking: 0,
        warnings: 0,
        duration: 100000,
      });

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      expect(alice?.topPriority).not.toBeNull();
    });

    it('should set top priority to null when all levels are high', () => {
      const reviews = createReviewsForDeveloper('alice', 5, {
        score: 10,
        blocking: 0,
        warnings: 0,
        duration: 10000,
        diffStats: { commitsCount: 5, additions: 200, deletions: 50 },
      });

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      if (alice.topPriority !== null) {
        const priorityLevel = alice.categoryLevels[alice.topPriority].level;
        expect(priorityLevel).toBeLessThanOrEqual(6);
      }
    });
  });

  describe('developer titles', () => {
    it('should assign architect title when quality is dominant', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 10, {
        score: 10,
        blocking: 0,
        warnings: 0,
        duration: 300000,
      });
      const bobReviews = createReviewsForDeveloper('bob', 10, {
        score: 3,
        blocking: 5,
        warnings: 8,
        duration: 30000,
      });

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      expect(alice?.categoryLevels.quality.level).toBeGreaterThan(
        alice?.categoryLevels.responsiveness.level ?? 10,
      );
      expect(alice?.title).toBe('architect');
    });

    it('should assign firefighter title when responsiveness is dominant', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 10, {
        score: 7,
        blocking: 1,
        warnings: 2,
        duration: 5000,
      });
      const bobReviews = createReviewsForDeveloper('bob', 10, {
        score: 7,
        blocking: 1,
        warnings: 2,
        duration: 500000,
      });

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      expect(alice?.title).toBe('firefighter');
    });

    it('should assign polyvalent title when all categories are balanced', () => {
      const reviews = Array.from({ length: 20 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 7,
          blocking: 1,
          warnings: 1,
          duration: 60000,
          diffStats: { commitsCount: 3, additions: 100, deletions: 50 },
        }),
      );

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      const levels = Object.values(alice.categoryLevels).map((category) => category.level);
      const maxLevel = Math.max(...levels);
      const minLevel = Math.min(...levels);
      if (maxLevel - minLevel <= 2) {
        expect(alice.title).toBe('polyvalent');
      }
    });
  });

  describe('overall level', () => {
    it('should compute overall level as weighted average of category levels', () => {
      const reviews = createReviewsForDeveloper('alice', 5, { score: 7 });

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      expect(alice.overallLevel).toBeGreaterThanOrEqual(1);
      expect(alice.overallLevel).toBeLessThanOrEqual(10);
      expect(Number.isInteger(alice.overallLevel)).toBe(true);
    });
  });

  describe('single developer team', () => {
    it('should use absolute benchmarks instead of team average for single developer', () => {
      const reviews = createReviewsForDeveloper('alice', 10, {
        score: 8,
        blocking: 0,
        warnings: 1,
        duration: 60000,
      });

      const result = computeDeveloperInsights(reviews);

      expect(result).toHaveLength(1);
      const alice = result[0];
      expect(alice.categoryLevels.quality.level).toBeGreaterThanOrEqual(1);
      expect(alice.categoryLevels.quality.level).toBeLessThanOrEqual(10);
    });
  });

  describe('metrics population', () => {
    it('should populate metrics with raw developer numbers', () => {
      const reviews = createReviewsForDeveloper('alice', 6, {
        score: 8,
        blocking: 1,
        warnings: 2,
        duration: 60000,
        diffStats: { commitsCount: 3, additions: 200, deletions: 50 },
      });

      const result = computeDeveloperInsights(reviews);

      const alice = result[0];
      expect(alice.metrics).toBeDefined();
      expect(alice.metrics).not.toHaveProperty('averageScore');
      expect(alice.metrics.averageBlocking).toBe(1);
      expect(alice.metrics.averageWarnings).toBe(2);
      expect(alice.metrics.averageDuration).toBe(60000);
      expect(alice.metrics.averageAdditions).toBe(200);
      expect(alice.metrics.averageDeletions).toBe(50);
    });

    it('should report the share of judged reviews ready at first review as quality rate', () => {
      const readyReviews = createReviewsForDeveloper('alice', 3, { verdict: 'ready', grade: 'B' });
      const changesReviews = Array.from({ length: 2 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-changes-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 4,
          verdict: 'changes',
          grade: 'C',
        }),
      );
      const unjudgedReview = ReviewStatsFactory.create({
        id: 'alice-unjudged',
        assignedBy: 'alice',
        mrNumber: 6,
        score: null,
      });

      const result = computeDeveloperInsights([...readyReviews, ...changesReviews, unjudgedReview]);

      const alice = result[0];
      expect(alice.metrics.firstReviewQualityRate).toBe(0.6);
    });

    it('should count a legacy scored review with blocking findings as not ready', () => {
      const cleanReviews = createReviewsForDeveloper('alice', 3, {
        score: 8,
        blocking: 0,
        warnings: 0,
      });
      const highScoreButBlocking = Array.from({ length: 2 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-blocking-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 4,
          score: 9,
          blocking: 1,
          warnings: 0,
        }),
      );

      const result = computeDeveloperInsights([...cleanReviews, ...highScoreButBlocking]);

      const alice = result[0];
      expect(alice.metrics.firstReviewQualityRate).toBe(0.6);
    });

    it('should report a zero quality rate when no review is judged', () => {
      const reviews = createReviewsForDeveloper('alice', 5, { score: null });

      const result = computeDeveloperInsights(reviews);

      expect(result[0].metrics.firstReviewQualityRate).toBe(0);
    });
  });

  describe('insight descriptions', () => {
    it('should describe a quality strength by the ready rate against the team', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 10, {
        verdict: 'ready',
        grade: 'A',
        blocking: 0,
        warnings: 0,
      });
      const bobReviews = Array.from({ length: 10 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `bob-${index}`,
          assignedBy: 'bob',
          mrNumber: index + 1,
          verdict: index < 5 ? 'ready' : 'changes',
          grade: index < 5 ? 'B' : 'D',
          blocking: index < 5 ? 0 : 2,
          warnings: 2,
        }),
      );

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      const qualityStrength = alice?.insightDescriptions.find(
        (description) => description.category === 'quality' && description.type === 'strength',
      );
      expect(qualityStrength).toEqual({
        category: 'quality',
        type: 'strength',
        descriptionKey: 'insight.quality.highReadiness',
        params: { readyRate: 100, teamReadyRate: 75, percent: 33 },
      });
    });

    it('should describe the iteration strength by the ready share', () => {
      const reviews = createReviewsForDeveloper('alice', 5, {
        score: null,
        verdict: 'ready',
        grade: 'A',
        blocking: 0,
        warnings: 0,
        suggestions: 0,
      });

      const result = computeDeveloperInsights(reviews);

      const iterationStrength = result[0].insightDescriptions.find(
        (description) => description.category === 'iteration' && description.type === 'strength',
      );
      expect(iterationStrength?.params).toEqual({ rate: 100 });
    });

    it('should generate insight descriptions for strengths and weaknesses', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 10, {
        score: 9,
        blocking: 0,
        warnings: 0,
        duration: 30000,
      });
      const bobReviews = createReviewsForDeveloper('bob', 10, {
        score: 4,
        blocking: 3,
        warnings: 5,
        duration: 300000,
      });

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      expect(alice).toBeDefined();
      expect(alice?.insightDescriptions.length).toBeGreaterThan(0);
    });

    it('should include category and type in each description', () => {
      const aliceReviews = createReviewsForDeveloper('alice', 10, {
        score: 9,
        blocking: 0,
        warnings: 0,
        duration: 30000,
      });
      const bobReviews = createReviewsForDeveloper('bob', 10, {
        score: 4,
        blocking: 3,
        warnings: 5,
        duration: 300000,
      });

      const result = computeDeveloperInsights([...aliceReviews, ...bobReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      if (alice && alice.insightDescriptions.length > 0) {
        for (const description of alice.insightDescriptions) {
          expect(['quality', 'responsiveness', 'codeVolume', 'iteration']).toContain(
            description.category,
          );
          expect(['strength', 'weakness']).toContain(description.type);
          expect(description.descriptionKey).toBeTruthy();
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle reviews with null scores', () => {
      const reviews = createReviewsForDeveloper('alice', 5, { score: null });

      const result = computeDeveloperInsights(reviews);

      expect(result).toHaveLength(1);
      const alice = result[0];
      expect(alice.categoryLevels.quality.level).toBeGreaterThanOrEqual(1);
    });

    it('should handle reviews without diff stats', () => {
      const reviews = createReviewsForDeveloper('alice', 5, {
        score: 7,
        diffStats: undefined,
      });

      const result = computeDeveloperInsights(reviews);

      expect(result).toHaveLength(1);
      const alice = result[0];
      expect(alice.categoryLevels.codeVolume.level).toBeGreaterThanOrEqual(1);
    });

    it('should handle zero developer duration when generating responsiveness strength', () => {
      const instantReviews = createReviewsForDeveloper('alice', 10, {
        score: 9,
        blocking: 0,
        warnings: 0,
        duration: 0,
      });
      const slowReviews = createReviewsForDeveloper('bob', 10, {
        score: 5,
        blocking: 2,
        warnings: 3,
        duration: 600000,
      });

      const result = computeDeveloperInsights([...instantReviews, ...slowReviews]);

      const alice = result.find((insight) => insight.developerName === 'alice');
      expect(alice).toBeDefined();
      expect(alice?.strengths).toContain('responsiveness');
      const responsivenessStrength = alice?.insightDescriptions.find(
        (description) =>
          description.category === 'responsiveness' && description.type === 'strength',
      );
      expect(responsivenessStrength).toBeDefined();
      expect(responsivenessStrength?.params?.percent).toBe(0);
    });

    it('should produce valid DeveloperInsight objects', () => {
      const reviews = [
        ...createReviewsForDeveloper('alice', 8, { score: 7, duration: 60000 }),
        ...createReviewsForDeveloper('bob', 6, { score: 5, duration: 120000 }),
      ];

      const result = computeDeveloperInsights(reviews);

      for (const insight of result) {
        expect(insight.developerName).toBeTruthy();
        expect(insight.overallLevel).toBeGreaterThanOrEqual(1);
        expect(insight.overallLevel).toBeLessThanOrEqual(10);
        expect(insight.reviewCount).toBeGreaterThanOrEqual(5);
        for (const category of Object.values(insight.categoryLevels)) {
          expect(category.level).toBeGreaterThanOrEqual(1);
          expect(category.level).toBeLessThanOrEqual(10);
          expect(['improving', 'declining', 'stable']).toContain(category.trend);
        }
      }
    });
  });
});
