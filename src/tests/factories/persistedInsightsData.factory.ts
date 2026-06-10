import type {
  PersistedDeveloperMetrics,
  PersistedInsightsData,
} from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { ReviewStats } from '@/modules/statistics-insights/services/statsService.js';

export class PersistedDeveloperMetricsFactory {
  static create(overrides: Partial<PersistedDeveloperMetrics> = {}): PersistedDeveloperMetrics {
    return {
      developerName: 'alice',
      totalReviews: 10,
      totalScore: 75,
      scoredReviewCount: 9,
      totalBlocking: 5,
      totalWarnings: 12,
      totalSuggestions: 20,
      totalDuration: 600000,
      totalAdditions: 1500,
      totalDeletions: 300,
      diffStatsReviewCount: 8,
      recentReviews: [],
      ...overrides,
    };
  }

  static withRecentReviews(
    recentReviews: ReviewStats[],
    overrides: Partial<PersistedDeveloperMetrics> = {},
  ): PersistedDeveloperMetrics {
    return this.create({ recentReviews, ...overrides });
  }
}

export class PersistedInsightsDataFactory {
  static create(overrides: Partial<PersistedInsightsData> = {}): PersistedInsightsData {
    return {
      developers: [],
      processedReviewIds: [],
      lastUpdated: '2024-01-15T10:00:00Z',
      aiInsights: null,
      reviewCountAtAiGeneration: 0,
      ...overrides,
    };
  }

  static withDevelopers(
    developers: PersistedDeveloperMetrics[],
    processedReviewIds: string[] = [],
  ): PersistedInsightsData {
    return this.create({
      developers,
      processedReviewIds,
    });
  }
}
