import type { Logger } from 'pino';

import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import type { SyncSummary } from '@/modules/tracking/entities/platformSync/syncSummary.js';

export interface PlatformSyncSchedulerDependencies {
  getRepositories: () => RepositoryConfig[];
  syncWithPlatform: (localPath: string) => SyncSummary | null;
  logger: Logger;
  intervalMs: number;
}

export function startPlatformSyncScheduler(dependencies: PlatformSyncSchedulerDependencies): {
  stop: () => void;
} {
  const { getRepositories, syncWithPlatform, logger, intervalMs } = dependencies;

  function syncAllRepositories(): void {
    for (const repository of getRepositories()) {
      if (!repository.enabled) continue;
      try {
        syncWithPlatform(repository.localPath);
      } catch (error) {
        logger.warn(
          {
            projectPath: repository.localPath,
            error: error instanceof Error ? error.message : String(error),
          },
          'Platform sync failed',
        );
      }
    }
  }

  syncAllRepositories();
  const intervalId = setInterval(syncAllRepositories, intervalMs);

  return {
    stop: () => clearInterval(intervalId),
  };
}
