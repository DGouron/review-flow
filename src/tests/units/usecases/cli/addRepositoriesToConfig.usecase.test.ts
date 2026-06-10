import { describe, it, expect, vi } from 'vitest';

import {
  AddRepositoriesToConfigUseCase,
  type AddRepositoriesToConfigDependencies,
} from '@/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.js';

function createFakeDeps(
  overrides?: Partial<AddRepositoriesToConfigDependencies>,
): AddRepositoriesToConfigDependencies {
  return {
    readFileSync: vi.fn(() =>
      JSON.stringify({
        server: { port: 3847 },
        user: { gitlabUsername: '', githubUsername: '' },
        queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
        repositories: [],
      }),
    ),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    ...overrides,
  };
}

describe('AddRepositoriesToConfigUseCase', () => {
  it('should add a new repository to an existing config', () => {
    const deps = createFakeDeps();
    const usecase = new AddRepositoriesToConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/home/user/.config/reviewflow/config.json',
      newRepositories: [{ name: 'my-app', localPath: '/home/user/projects/my-app', enabled: true }],
    });

    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe('my-app');
    expect(result.skipped).toHaveLength(0);
  });

  it('should skip repositories already present in config', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn(() =>
        JSON.stringify({
          server: { port: 3847 },
          user: { gitlabUsername: '', githubUsername: '' },
          queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
          repositories: [
            { name: 'existing-app', localPath: '/home/user/projects/existing-app', enabled: true },
          ],
        }),
      ),
    });
    const usecase = new AddRepositoriesToConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      newRepositories: [
        { name: 'existing-app', localPath: '/home/user/projects/existing-app', enabled: true },
      ],
    });

    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe('existing-app');
  });

  it('should handle a mix of new and existing repositories', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn(() =>
        JSON.stringify({
          server: { port: 3847 },
          user: { gitlabUsername: '', githubUsername: '' },
          queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
          repositories: [{ name: 'old-app', localPath: '/projects/old-app', enabled: true }],
        }),
      ),
    });
    const usecase = new AddRepositoriesToConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      newRepositories: [
        { name: 'old-app', localPath: '/projects/old-app', enabled: true },
        { name: 'new-app', localPath: '/projects/new-app', enabled: true },
      ],
    });

    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe('new-app');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe('old-app');
  });

  it('should throw when config file does not exist', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn(() => false),
    });
    const usecase = new AddRepositoriesToConfigUseCase(deps);

    expect(() =>
      usecase.execute({
        configPath: '/missing/config.json',
        newRepositories: [{ name: 'app', localPath: '/projects/app', enabled: true }],
      }),
    ).toThrow();
  });

  it('should throw a meaningful error when config contains invalid JSON', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn(() => '{ invalid json !!!'),
    });
    const usecase = new AddRepositoriesToConfigUseCase(deps);

    expect(() =>
      usecase.execute({
        configPath: '/config/config.json',
        newRepositories: [{ name: 'app', localPath: '/projects/app', enabled: true }],
      }),
    ).toThrow('Invalid JSON in configuration file: /config/config.json');
  });

  it('should write the merged repositories back to config file', () => {
    const existingConfig = {
      server: { port: 3847 },
      user: { gitlabUsername: 'me', githubUsername: '' },
      queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
      repositories: [{ name: 'old-app', localPath: '/projects/old-app', enabled: true }],
    };
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({
      readFileSync: vi.fn(() => JSON.stringify(existingConfig)),
      writeFileSync,
    });
    const usecase = new AddRepositoriesToConfigUseCase(deps);

    usecase.execute({
      configPath: '/config/config.json',
      newRepositories: [{ name: 'new-app', localPath: '/projects/new-app', enabled: true }],
    });

    const writtenConfig = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(writtenConfig.repositories).toHaveLength(2);
    expect(writtenConfig.server.port).toBe(3847);
    expect(writtenConfig.user.gitlabUsername).toBe('me');
  });
});
