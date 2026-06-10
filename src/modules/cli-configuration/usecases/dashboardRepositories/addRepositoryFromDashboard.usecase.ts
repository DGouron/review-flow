import { basename } from 'node:path';

import type { RepositoryEntry } from '@/modules/cli-configuration/entities/repositoryEntry/repositoryEntry.js';
import type { AddRepositoriesToConfigUseCase } from '@/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export type AddRepositoryRouteResult =
  | { status: 'ok'; repositories: RepositoryConfig[] }
  | { status: 'not-a-directory' }
  | { status: 'duplicate' }
  | { status: 'write-failed' };

export interface AddRepositoryFromDashboardDependencies {
  isDirectory: (path: string) => boolean;
  addRepositoriesToConfig: AddRepositoriesToConfigUseCase;
  enrichSingleRepository: (entry: RepositoryEntry) => RepositoryConfig;
  repositories: RepositoryConfig[];
  configPath: string;
}

export class AddRepositoryFromDashboardUseCase {
  constructor(private readonly deps: AddRepositoryFromDashboardDependencies) {}

  execute(input: { localPath: string }): AddRepositoryRouteResult {
    if (!this.deps.isDirectory(input.localPath)) {
      return { status: 'not-a-directory' };
    }
    const name = basename(input.localPath);
    const entry: RepositoryEntry = { name, localPath: input.localPath, enabled: true };

    try {
      const result = this.deps.addRepositoriesToConfig.execute({
        configPath: this.deps.configPath,
        newRepositories: [entry],
      });
      if (result.skipped.length > 0) {
        return { status: 'duplicate' };
      }
    } catch {
      return { status: 'write-failed' };
    }

    const enriched = this.deps.enrichSingleRepository(entry);
    this.deps.repositories.push(enriched);
    return { status: 'ok', repositories: this.deps.repositories };
  }
}
