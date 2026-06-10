import type { RemoveRepositoryFromConfigUseCase } from '@/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export type RemoveRepositoryRouteResult =
  | { status: 'ok'; repositories: RepositoryConfig[] }
  | { status: 'not-found' }
  | { status: 'write-failed' };

export interface RemoveRepositoryFromDashboardDependencies {
  removeRepositoryFromConfig: RemoveRepositoryFromConfigUseCase;
  repositories: RepositoryConfig[];
  configPath: string;
}

export class RemoveRepositoryFromDashboardUseCase {
  constructor(private readonly deps: RemoveRepositoryFromDashboardDependencies) {}

  execute(input: { localPath: string }): RemoveRepositoryRouteResult {
    let result: ReturnType<RemoveRepositoryFromConfigUseCase['execute']>;
    try {
      result = this.deps.removeRepositoryFromConfig.execute({
        configPath: this.deps.configPath,
        localPath: input.localPath,
      });
    } catch {
      return { status: 'write-failed' };
    }
    if (!result.removed) {
      return { status: 'not-found' };
    }
    const index = this.deps.repositories.findIndex(
      (repository) => repository.localPath === input.localPath,
    );
    if (index >= 0) {
      this.deps.repositories.splice(index, 1);
    }
    return { status: 'ok', repositories: this.deps.repositories };
  }
}
