import { describe, it, expect, vi } from 'vitest';

import { executeDiscover, type DiscoverDependencies } from '@/main/commands/discover.command.js';
import type { DiscoveredRepository } from '@/modules/cli-configuration/usecases/cli/discoverRepositories.usecase.js';

function createFakeDiscoverDeps(overrides?: Partial<DiscoverDependencies>): DiscoverDependencies {
  return {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() =>
      JSON.stringify({
        server: { port: 3847 },
        user: { gitlabUsername: '', githubUsername: '' },
        queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
        repositories: [],
      }),
    ),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    getGitRemoteUrl: vi.fn(() => null),
    getConfigPath: vi.fn(() => '/home/user/.config/reviewflow/config.json'),
    log: vi.fn(),
    selectRepositories: vi.fn(async (repos: DiscoveredRepository[]) => repos),
    ...overrides,
  };
}

describe('executeDiscover', () => {
  it('should throw when config does not exist and repos are selected', async () => {
    const deps = createFakeDiscoverDeps({
      existsSync: vi.fn((path: string) => {
        if (path === '/home/user/.config/reviewflow/config.json') return false;
        if (path === '/projects') return true;
        if (path === '/projects/app/.git') return true;
        return false;
      }),
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') return [{ name: 'app', isDirectory: () => true }];
        return [];
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/app'),
    });

    await expect(executeDiscover(['/projects'], 3, deps)).rejects.toThrow(
      'Configuration file not found',
    );
  });

  it('should log message and skip when no repositories found', async () => {
    const log = vi.fn();
    const writeFileSync = vi.fn();
    const deps = createFakeDiscoverDeps({
      readdirSync: vi.fn(() => []),
      log,
      writeFileSync,
    });

    await executeDiscover(['/empty/path'], 3, deps);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('No new repositories found'));
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('should not write config when user selects nothing', async () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDiscoverDeps({
      readdirSync: vi.fn((path: string) => {
        if (path === '/projects') return [{ name: 'app', isDirectory: () => true }];
        return [];
      }),
      existsSync: vi.fn((path: string) => {
        if (path === '/home/user/.config/reviewflow/config.json') return true;
        if (path === '/projects') return true;
        if (path === '/projects/app/.git') return true;
        return false;
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/app'),
      selectRepositories: vi.fn(async () => []),
      writeFileSync,
    });

    await executeDiscover(['/projects'], 3, deps);

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('should discover repos and add selected ones to config', async () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDiscoverDeps({
      readdirSync: vi.fn((path: string) => {
        if (path === '/home/user/projects') {
          return [{ name: 'new-app', isDirectory: () => true }];
        }
        return [];
      }),
      existsSync: vi.fn((path: string) => {
        if (path === '/home/user/.config/reviewflow/config.json') return true;
        if (path === '/home/user/projects') return true;
        if (path === '/home/user/projects/new-app/.git') return true;
        return false;
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/new-app'),
      writeFileSync,
    });

    await executeDiscover(['/home/user/projects'], 3, deps);

    expect(writeFileSync).toHaveBeenCalled();
    const writtenConfig = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(writtenConfig.repositories).toHaveLength(1);
    expect(writtenConfig.repositories[0].name).toBe('new-app');
  });
});
