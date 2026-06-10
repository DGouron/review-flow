import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import type { DeveloperInsight } from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import type { InsightsGateway } from '@/modules/statistics-insights/entities/insight/insights.gateway.js';
import type { TeamInsight } from '@/modules/statistics-insights/entities/insight/teamInsight.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { computeInsightsWithPersistence } from '@/modules/statistics-insights/usecases/insights/computeInsightsWithPersistence.usecase.js';

export interface GetInsightsWithAiStatusInput {
  projectPath: string;
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
}

export interface GetInsightsWithAiStatusResult {
  developerInsights: DeveloperInsight[];
  teamInsight: TeamInsight;
  aiInsights: AiInsightsResult | null;
  hasNewReviewsSinceAiGeneration: boolean;
}

const EMPTY_TEAM_INSIGHT: TeamInsight = {
  developerCount: 0,
  totalReviewCount: 0,
  averageLevels: { quality: 5, responsiveness: 5, codeVolume: 5, iteration: 5 },
  strengths: [],
  weaknesses: [],
  tips: [],
};

function computeHasNewReviewsSinceAiGeneration(
  currentReviewCount: number,
  reviewCountAtAiGeneration: number,
  aiGeneratedAt: string | null,
): boolean {
  if (!aiGeneratedAt) return false;
  return currentReviewCount > reviewCountAtAiGeneration;
}

export function getInsightsWithAiStatus(
  input: GetInsightsWithAiStatusInput,
): GetInsightsWithAiStatusResult {
  const { projectPath, statsGateway, insightsGateway } = input;

  const stats = statsGateway.loadProjectStats(projectPath);
  const persistedData = insightsGateway.loadPersistedInsights(projectPath);

  if (!stats || stats.reviews.length === 0) {
    if (persistedData) {
      const result = computeInsightsWithPersistence([], persistedData);
      insightsGateway.savePersistedInsights(projectPath, {
        ...result.persistedData,
        aiInsights: persistedData.aiInsights ?? null,
        reviewCountAtAiGeneration: persistedData.reviewCountAtAiGeneration ?? 0,
      });
      const hasNewReviewsSinceAiGeneration = computeHasNewReviewsSinceAiGeneration(
        result.persistedData.processedReviewIds.length,
        persistedData.reviewCountAtAiGeneration ?? 0,
        persistedData.aiInsights?.generatedAt ?? null,
      );
      return {
        developerInsights: result.developerInsights,
        teamInsight: result.teamInsight,
        aiInsights: persistedData.aiInsights ?? null,
        hasNewReviewsSinceAiGeneration,
      };
    }

    return {
      developerInsights: [],
      teamInsight: EMPTY_TEAM_INSIGHT,
      aiInsights: null,
      hasNewReviewsSinceAiGeneration: false,
    };
  }

  const result = computeInsightsWithPersistence(stats.reviews, persistedData);
  insightsGateway.savePersistedInsights(projectPath, {
    ...result.persistedData,
    aiInsights: persistedData?.aiInsights ?? null,
    reviewCountAtAiGeneration: persistedData?.reviewCountAtAiGeneration ?? 0,
  });

  const hasNewReviewsSinceAiGeneration = computeHasNewReviewsSinceAiGeneration(
    result.persistedData.processedReviewIds.length,
    persistedData?.reviewCountAtAiGeneration ?? 0,
    persistedData?.aiInsights?.generatedAt ?? null,
  );

  return {
    developerInsights: result.developerInsights,
    teamInsight: result.teamInsight,
    aiInsights: persistedData?.aiInsights ?? null,
    hasNewReviewsSinceAiGeneration,
  };
}
