import { describe, it, expect, vi } from 'vitest';
import {
  DiscoverRepositoriesUseCase,
  type DiscoverRepositoriesDependencies,
  type DiscoverRepositoriesInput,
} from '../../../../usecases/cli/discoverRepositories.usecase.js';

function createFakeDeps(
  overrides?: Partial<DiscoverRepositoriesDependencies>,
): DiscoverRepositoriesDependencies {
  return {
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    getGitRemoteUrl: vi.fn(() => null),
    ...overrides,
  };
}

function createFakeInput(
  overrides?: Partial<DiscoverRepositoriesInput>,
): DiscoverRepositoriesInput {
  return {
    scanPaths: ['/home/user/projects'],
    maxDepth: 3,
    ...overrides,
  };
}

describe('DiscoverRepositoriesUseCase', () => {
  it('should return empty results when scan paths do not exist', () => {
    const deps = createFakeDeps({ existsSync: vi.fn(() => false) });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput());

    expect(result.repositories).toEqual([]);
    expect(result.skippedPaths).toContain('/home/user/projects');
  });

  it('should discover a repository with .git directory', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/home/user/projects') return true;
        if (path === '/home/user/projects/my-app/.git') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/home/user/projects') {
          return [
            { name: 'my-app', isDirectory: () => true },
          ];
        }
        return [];
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/my-app'),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput());

    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]).toEqual({
      name: 'my-app',
      localPath: '/home/user/projects/my-app',
      platform: 'github',
      remoteUrl: 'https://github.com/user/my-app',
      hasReviewConfig: false,
    });
  });

  it('should detect gitlab platform from remote url', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/projects') return true;
        if (path === '/projects/repo/.git') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') {
          return [{ name: 'repo', isDirectory: () => true }];
        }
        return [];
      }),
      getGitRemoteUrl: vi.fn(() => 'https://gitlab.com/team/repo'),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput({ scanPaths: ['/projects'] }));

    expect(result.repositories[0].platform).toBe('gitlab');
  });

  it('should detect review config presence', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/projects') return true;
        if (path === '/projects/repo/.git') return true;
        if (path === '/projects/repo/.claude/reviews/config.json') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') {
          return [{ name: 'repo', isDirectory: () => true }];
        }
        return [];
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/repo'),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput({ scanPaths: ['/projects'] }));

    expect(result.repositories[0].hasReviewConfig).toBe(true);
  });

  it('should skip hidden directories', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/projects') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') {
          return [
            { name: '.hidden', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ];
        }
        return [];
      }),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput({ scanPaths: ['/projects'] }));

    expect(result.repositories).toEqual([]);
  });

  it('should respect maxDepth limit', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/projects') return true;
        if (path === '/projects/level1/level2/level3/deep-repo/.git') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') {
          return [{ name: 'level1', isDirectory: () => true }];
        }
        if (path === '/projects/level1') {
          return [{ name: 'level2', isDirectory: () => true }];
        }
        return [];
      }),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput({ maxDepth: 1 }));

    expect(result.repositories).toEqual([]);
  });

  it('should handle repos without remote url', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/projects') return true;
        if (path === '/projects/local-only/.git') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') {
          return [{ name: 'local-only', isDirectory: () => true }];
        }
        return [];
      }),
      getGitRemoteUrl: vi.fn(() => null),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(createFakeInput({ scanPaths: ['/projects'] }));

    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0].platform).toBeNull();
    expect(result.repositories[0].remoteUrl).toBeNull();
  });

  it('should scan multiple paths', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/path-a' || path === '/path-b') return true;
        if (path === '/path-a/repo1/.git') return true;
        if (path === '/path-b/repo2/.git') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/path-a') return [{ name: 'repo1', isDirectory: () => true }];
        if (path === '/path-b') return [{ name: 'repo2', isDirectory: () => true }];
        return [];
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/repo'),
    });
    const usecase = new DiscoverRepositoriesUseCase(deps);

    const result = usecase.execute(
      createFakeInput({ scanPaths: ['/path-a', '/path-b'] }),
    );

    expect(result.repositories).toHaveLength(2);
    expect(result.scannedPaths).toEqual(['/path-a', '/path-b']);
  });
});
