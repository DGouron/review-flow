import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import type { InsightsGateway } from '@/modules/statistics-insights/entities/insight/insights.gateway.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { computeInsightsWithPersistence } from '@/modules/statistics-insights/usecases/insights/computeInsightsWithPersistence.usecase.js';

interface PersistAiInsightsInput {
  projectPath: string;
  aiInsights: AiInsightsResult;
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
}

export function persistAiInsightsResult(input: PersistAiInsightsInput): void {
  const { projectPath, aiInsights, statsGateway, insightsGateway } = input;

  const existingData = insightsGateway.loadPersistedInsights(projectPath);
  const stats = statsGateway.loadProjectStats(projectPath);
  const currentReviews = stats?.reviews ?? [];
  const upToDateResult = computeInsightsWithPersistence(currentReviews, existingData);

  insightsGateway.savePersistedInsights(projectPath, {
    ...upToDateResult.persistedData,
    aiInsights,
    reviewCountAtAiGeneration: upToDateResult.persistedData.processedReviewIds.length,
  });
}
