import type {
  DeclaredRepository,
  RepositoriesListGateway,
} from '@/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export class RepositoriesListRuntimeConfigGateway implements RepositoriesListGateway {
  constructor(private readonly getRepositories: () => RepositoryConfig[]) {}

  list(): DeclaredRepository[] {
    return this.getRepositories().map((repository) => ({
      name: repository.name,
      localPath: repository.localPath,
      enabled: repository.enabled,
    }));
  }
}
