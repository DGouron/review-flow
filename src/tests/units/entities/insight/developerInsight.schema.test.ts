import { describe, it, expect } from 'vitest';

import { developerInsightSchema } from '@/modules/statistics-insights/entities/insight/developerInsight.schema.js';
import { DeveloperInsightFactory } from '@/tests/factories/developerInsight.factory.js';

describe('DeveloperInsight schema', () => {
  it('should validate a complete developer insight', () => {
    const insight = DeveloperInsightFactory.create();

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should require a developer name', () => {
    const insight = DeveloperInsightFactory.create();
    const { developerName: _, ...withoutName } = insight;

    const result = developerInsightSchema.safeParse(withoutName);

    expect(result.success).toBe(false);
  });

  it('should validate category levels are between 1 and 10', () => {
    const insight = DeveloperInsightFactory.create({
      categoryLevels: {
        quality: { level: 11, trend: 'stable' },
        responsiveness: { level: 5, trend: 'stable' },
        codeVolume: { level: 5, trend: 'stable' },
        iteration: { level: 5, trend: 'stable' },
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate category levels minimum is 1', () => {
    const insight = DeveloperInsightFactory.create({
      categoryLevels: {
        quality: { level: 0, trend: 'stable' },
        responsiveness: { level: 5, trend: 'stable' },
        codeVolume: { level: 5, trend: 'stable' },
        iteration: { level: 5, trend: 'stable' },
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate trend values', () => {
    const insight = DeveloperInsightFactory.create({
      categoryLevels: {
        quality: { level: 5, trend: 'invalid' },
        responsiveness: { level: 5, trend: 'stable' },
        codeVolume: { level: 5, trend: 'stable' },
        iteration: { level: 5, trend: 'stable' },
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate title is a known developer title', () => {
    const insight = DeveloperInsightFactory.create({
      title: 'unknown',
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should accept insights with empty strengths and weaknesses', () => {
    const insight = DeveloperInsightFactory.create({
      strengths: [],
      weaknesses: [],
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should validate overall level is between 1 and 10', () => {
    const insight = DeveloperInsightFactory.create({
      overallLevel: 11,
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should require review count', () => {
    const insight = DeveloperInsightFactory.create();
    const { reviewCount: _, ...withoutCount } = insight;

    const result = developerInsightSchema.safeParse(withoutCount);

    expect(result.success).toBe(false);
  });

  it('should accept null for top priority', () => {
    const insight = DeveloperInsightFactory.create({
      topPriority: null,
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should validate metrics field with raw developer numbers', () => {
    const insight = DeveloperInsightFactory.create({
      metrics: {
        averageScore: 8.3,
        averageBlocking: 0.1,
        averageWarnings: 1.4,
        averageDuration: 60000,
        totalFollowups: null,
        averageAdditions: 150,
        averageDeletions: 30,
        firstReviewQualityRate: 0.85,
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metrics).toBeDefined();
      expect(result.data.metrics.averageScore).toBe(8.3);
      expect(result.data.metrics.averageBlocking).toBe(0.1);
      expect(result.data.metrics.firstReviewQualityRate).toBe(0.85);
    }
  });

  it('should validate insight descriptions with enriched context', () => {
    const insight = DeveloperInsightFactory.create({
      insightDescriptions: [
        {
          category: 'quality',
          type: 'strength',
          descriptionKey: 'insight.quality.highScore',
          params: { score: 8.3, teamAverage: 7.5 },
        },
      ],
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.insightDescriptions).toHaveLength(1);
      expect(result.data.insightDescriptions[0].category).toBe('quality');
      expect(result.data.insightDescriptions[0].type).toBe('strength');
      expect(result.data.insightDescriptions[0].descriptionKey).toBe('insight.quality.highScore');
    }
  });

  it('should accept empty insight descriptions array', () => {
    const insight = DeveloperInsightFactory.create({
      insightDescriptions: [],
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.insightDescriptions).toEqual([]);
    }
  });
});
