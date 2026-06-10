import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { backfillDiffStats } from '@/modules/statistics-insights/usecases/stats/backfillDiffStats.usecase.js';
import { recalculateProjectStats } from '@/modules/statistics-insights/usecases/stats/recalculateProjectStats.usecase.js';

export interface RecalculateWithBackfillInput {
  projectPath: string;
  shouldBackfill: boolean;
  platform: string | null;
}

export interface RecalculateWithBackfillDependencies {
  statsGateway: StatsGateway;
  diffStatsFetchGateways: { gitlab: DiffStatsFetchGateway; github: DiffStatsFetchGateway } | null;
  onProgress: (progress: BackfillProgress) => void;
  logger: {
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
  };
}

export async function recalculateWithBackfill(
  input: RecalculateWithBackfillInput,
  dependencies: RecalculateWithBackfillDependencies,
): Promise<void> {
  const { projectPath, shouldBackfill, platform } = input;
  const { statsGateway, diffStatsFetchGateways, onProgress, logger } = dependencies;

  try {
    if (shouldBackfill && diffStatsFetchGateways && platform) {
      const resolvedPlatform = platform === 'github' ? 'github' : 'gitlab';
      const gateway = diffStatsFetchGateways[resolvedPlatform];

      await backfillDiffStats(
        {
          projectPath,
          onProgress: (progress) => {
            onProgress(progress);
          },
        },
        {
          statsGateway,
          diffStatsFetchGateway: gateway,
          logger: { warn: logger.warn },
        },
      );
    }

    recalculateProjectStats(projectPath, { statsGateway });

    onProgress({
      total: 0,
      completed: 0,
      failed: 0,
      status: 'completed',
    });
  } catch (error) {
    logger.error('Recalculation failed', { projectPath, error });
  }
}
