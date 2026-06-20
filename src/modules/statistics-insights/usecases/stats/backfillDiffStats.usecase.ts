import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';

export interface BackfillDiffStatsDependencies {
  statsGateway: StatsGateway;
  diffStatsFetchGateway: DiffStatsFetchGateway;
  logger: { warn: (message: string, data?: unknown) => void };
}

export interface BackfillDiffStatsInput {
  projectPath: string;
  batchSize?: number;
  batchDelayMs?: number;
  onProgress?: (progress: BackfillProgress) => void;
}

export async function backfillDiffStats(
  input: BackfillDiffStatsInput,
  dependencies: BackfillDiffStatsDependencies,
): Promise<BackfillProgress> {
  const { statsGateway, diffStatsFetchGateway, logger } = dependencies;
  const { projectPath, batchSize = 10, batchDelayMs = 2000, onProgress } = input;

  const stats = statsGateway.loadProjectStats(projectPath);

  if (!stats) {
    return { total: 0, completed: 0, failed: 0, status: 'completed' };
  }

  const reviewsNeedingBackfill = stats.reviews.filter(
    (review) => review.diffStats === null || review.diffStats === undefined,
  );

  if (reviewsNeedingBackfill.length === 0) {
    return { total: 0, completed: 0, failed: 0, status: 'completed' };
  }

  const progress: BackfillProgress = {
    total: reviewsNeedingBackfill.length,
    completed: 0,
    failed: 0,
    status: 'running',
  };

  for (let batchStart = 0; batchStart < reviewsNeedingBackfill.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, reviewsNeedingBackfill.length);
    const batch = reviewsNeedingBackfill.slice(batchStart, batchEnd);

    for (const review of batch) {
      try {
        const diffStats = await diffStatsFetchGateway.fetchDiffStats(projectPath, review.mrNumber);
        review.diffStats = diffStats;
      } catch (error) {
        logger.warn('Failed to fetch diff stats for review', { mrNumber: review.mrNumber, error });
        review.diffStats = null;
        progress.failed++;
      }

      progress.completed++;
      onProgress?.({ ...progress });
    }

    const isLastBatch = batchEnd >= reviewsNeedingBackfill.length;
    if (!isLastBatch && batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  progress.status = 'completed';

  statsGateway.saveProjectStats(projectPath, stats);

  return progress;
}
