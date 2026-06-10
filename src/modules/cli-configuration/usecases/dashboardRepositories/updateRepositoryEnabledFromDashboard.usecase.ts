import type { ToggleRepositoryEnabledUseCase } from '@/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export type PatchRepositoryRouteResult =
  | { status: 'ok'; repositories: RepositoryConfig[] }
  | { status: 'not-found' }
  | { status: 'write-failed' };

export interface UpdateRepositoryEnabledFromDashboardDependencies {
  toggleRepositoryEnabled: ToggleRepositoryEnabledUseCase;
  repositories: RepositoryConfig[];
  configPath: string;
}

export class UpdateRepositoryEnabledFromDashboardUseCase {
  constructor(private readonly deps: UpdateRepositoryEnabledFromDashboardDependencies) {}

  execute(input: { localPath: string; enabled: boolean }): PatchRepositoryRouteResult {
    let result: ReturnType<ToggleRepositoryEnabledUseCase['execute']>;
    try {
      result = this.deps.toggleRepositoryEnabled.execute({
        configPath: this.deps.configPath,
        localPath: input.localPath,
        enabled: input.enabled,
      });
    } catch {
      return { status: 'write-failed' };
    }
    if (!result.updated) {
      return { status: 'not-found' };
    }
    const target = this.deps.repositories.find(
      (repository) => repository.localPath === input.localPath,
    );
    if (target) {
      target.enabled = input.enabled;
    }
    return { status: 'ok', repositories: this.deps.repositories };
  }
}
