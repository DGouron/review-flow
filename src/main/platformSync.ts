import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import { resolveProjectIdentifier } from '@/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.js';
import type { SyncSummary } from '@/modules/tracking/entities/platformSync/syncSummary.js';
import type { ReconcileWithPlatformUseCase } from '@/modules/tracking/usecases/tracking/reconcileWithPlatform.usecase.js';

export type PlatformSync = (localPath: string) => SyncSummary | null;

interface PlatformSyncDependencies {
  getRepositories: () => RepositoryConfig[];
  reconcileWithPlatform: Pick<ReconcileWithPlatformUseCase, 'execute'>;
}

export function createPlatformSync(dependencies: PlatformSyncDependencies): PlatformSync {
  return (localPath) => {
    const repository = dependencies
      .getRepositories()
      .find(
        (candidate) =>
          candidate.enabled && candidate.platform === 'github' && candidate.localPath === localPath,
      );
    if (!repository) return null;

    const project = resolveProjectIdentifier(repository.remoteUrl);
    if (!project) return null;

    return dependencies.reconcileWithPlatform.execute({ localPath, project });
  };
}
