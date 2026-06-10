import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export class RepositoryConfigFactory {
  static create(overrides: Partial<RepositoryConfig> = {}): RepositoryConfig {
    return {
      name: 'sample-project',
      platform: 'gitlab',
      remoteUrl: 'https://gitlab.com/org/sample-project',
      localPath: '/repos/sample-project',
      skill: 'review-code',
      enabled: true,
      ...overrides,
    };
  }
}
