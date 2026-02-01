import type { Config, RepositoryConfig } from '../../config/loader.js';

export function createTestRepository(
  overrides?: Partial<RepositoryConfig>
): RepositoryConfig {
  return {
    name: 'test-repo',
    platform: 'gitlab',
    remoteUrl: 'https://gitlab.com/test/repo',
    localPath: '/tmp/test-repo',
    skill: 'review-code',
    enabled: true,
    ...overrides,
  };
}

export function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    server: { port: 3000 },
    user: {
      gitlabUsername: 'test-user',
      githubUsername: 'test-user-gh',
    },
    queue: {
      maxConcurrent: 2,
      deduplicationWindowMs: 60000,
    },
    repositories: [createTestRepository()],
    ...overrides,
  };
}
