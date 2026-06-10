import {
  DEFAULT_PROJECT_CONCURRENCY_CAP,
  effectiveProjectConcurrencyCap,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.js';
import type { ProjectConfigGateway } from '@/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.js';
import type { RepositoriesListGateway } from '@/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface QueueCapacityPort {
  setGlobalConcurrency(value: number): void;
  setProjectConcurrencyCap(projectPath: string, cap: number): void;
}

export type RecomputeGlobalConcurrencyInput = Record<string, never>;

export interface RecomputeGlobalConcurrencyResult {
  totalCapacity: number;
  perProjectCaps: Array<{ path: string; cap: number }>;
}

export interface RecomputeGlobalConcurrencyDependencies {
  repositoriesListGateway: RepositoriesListGateway;
  projectConfigGateway: ProjectConfigGateway;
  queueCapacityPort: QueueCapacityPort;
}

export class RecomputeGlobalConcurrencyUseCase implements UseCase<
  RecomputeGlobalConcurrencyInput,
  RecomputeGlobalConcurrencyResult
> {
  constructor(private readonly dependencies: RecomputeGlobalConcurrencyDependencies) {}

  execute(_input: RecomputeGlobalConcurrencyInput): RecomputeGlobalConcurrencyResult {
    const { repositoriesListGateway, projectConfigGateway, queueCapacityPort } = this.dependencies;
    const repositories = repositoriesListGateway.list();
    const perProjectCaps: Array<{ path: string; cap: number }> = [];

    for (const repository of repositories) {
      const readResult = projectConfigGateway.read(repository.localPath);
      const cap =
        readResult.status === 'ok'
          ? effectiveProjectConcurrencyCap(readResult.config)
          : DEFAULT_PROJECT_CONCURRENCY_CAP;
      perProjectCaps.push({ path: repository.localPath, cap });
      queueCapacityPort.setProjectConcurrencyCap(repository.localPath, cap);
    }

    const totalCapacity = perProjectCaps.reduce((sum, entry) => sum + entry.cap, 0);
    queueCapacityPort.setGlobalConcurrency(Math.max(totalCapacity, 1));

    return { totalCapacity, perProjectCaps };
  }
}
