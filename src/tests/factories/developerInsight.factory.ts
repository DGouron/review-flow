import type { DeveloperInsight } from '@/modules/statistics-insights/entities/insight/developerInsight.js';

export class DeveloperInsightFactory {
  static create(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const defaults: DeveloperInsight = {
      developerName: 'alice',
      title: 'architect',
      overallLevel: 7,
      categoryLevels: {
        quality: { level: 8, trend: 'improving' },
        responsiveness: { level: 6, trend: 'stable' },
        codeVolume: { level: 7, trend: 'stable' },
        iteration: { level: 6, trend: 'declining' },
      },
      strengths: ['quality'],
      weaknesses: ['iteration'],
      topPriority: 'iteration',
      reviewCount: 10,
      metrics: {
        averageBlocking: 0.5,
        averageWarnings: 1.0,
        averageDuration: 60000,
        totalFollowups: null,
        averageAdditions: 150,
        averageDeletions: 30,
        firstReviewQualityRate: 0.75,
      },
      insightDescriptions: [],
    };

    return { ...defaults, ...overrides };
  }

  static createValid(overrides: Partial<DeveloperInsight> = {}): DeveloperInsight {
    return {
      developerName: 'alice',
      title: 'architect',
      overallLevel: 7,
      categoryLevels: {
        quality: { level: 8, trend: 'improving' },
        responsiveness: { level: 6, trend: 'stable' },
        codeVolume: { level: 7, trend: 'stable' },
        iteration: { level: 6, trend: 'declining' },
      },
      strengths: ['quality'],
      weaknesses: ['iteration'],
      topPriority: 'iteration',
      reviewCount: 10,
      metrics: {
        averageBlocking: 0.5,
        averageWarnings: 1.0,
        averageDuration: 60000,
        totalFollowups: null,
        averageAdditions: 150,
        averageDeletions: 30,
        firstReviewQualityRate: 0.75,
      },
      insightDescriptions: [],
      ...overrides,
    };
  }
}
