import { describe, it, expect, vi } from 'vitest';

import {
  RemoveRepositoryFromConfigUseCase,
  type RemoveRepositoryFromConfigDependencies,
} from '@/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.js';

function baseConfig(repositories: Array<{ name: string; localPath: string; enabled: boolean }>) {
  return {
    server: { port: 3847 },
    user: { gitlabUsername: '', githubUsername: '' },
    queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
    repositories,
  };
}

function createFakeDeps(
  overrides?: Partial<RemoveRepositoryFromConfigDependencies>,
): RemoveRepositoryFromConfigDependencies {
  return {
    readFileSync: vi.fn(() =>
      JSON.stringify(
        baseConfig([{ name: 'old-project', localPath: '/home/dev/old-project', enabled: true }]),
      ),
    ),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    ...overrides,
  };
}

describe('RemoveRepositoryFromConfigUseCase', () => {
  it('removes the matching entry and persists the new array', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({ writeFileSync });
    const usecase = new RemoveRepositoryFromConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      localPath: '/home/dev/old-project',
    });

    expect(result.removed).toEqual({
      name: 'old-project',
      localPath: '/home/dev/old-project',
      enabled: true,
    });
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeFileSync.mock.calls[0]?.[1] as string);
    expect(written.repositories).toHaveLength(0);
  });

  it('returns removed=null and does not write when localPath is unknown', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({ writeFileSync });
    const usecase = new RemoveRepositoryFromConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      localPath: '/home/dev/missing',
    });

    expect(result.removed).toBeNull();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('throws when config file does not exist', () => {
    const deps = createFakeDeps({ existsSync: vi.fn(() => false) });
    const usecase = new RemoveRepositoryFromConfigUseCase(deps);

    expect(() =>
      usecase.execute({ configPath: '/missing/config.json', localPath: '/home/dev/x' }),
    ).toThrow();
  });

  it('throws a meaningful error when config contains invalid JSON', () => {
    const deps = createFakeDeps({ readFileSync: vi.fn(() => '{ invalid json !!!') });
    const usecase = new RemoveRepositoryFromConfigUseCase(deps);

    expect(() =>
      usecase.execute({ configPath: '/config/config.json', localPath: '/home/dev/x' }),
    ).toThrow('Invalid JSON in configuration file: /config/config.json');
  });

  it('preserves the order of remaining repositories when one is removed', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({
      readFileSync: vi.fn(() =>
        JSON.stringify(
          baseConfig([
            { name: 'first', localPath: '/repos/first', enabled: true },
            { name: 'second', localPath: '/repos/second', enabled: true },
            { name: 'third', localPath: '/repos/third', enabled: false },
          ]),
        ),
      ),
      writeFileSync,
    });
    const usecase = new RemoveRepositoryFromConfigUseCase(deps);

    usecase.execute({ configPath: '/config/config.json', localPath: '/repos/second' });

    const written = JSON.parse(writeFileSync.mock.calls[0]?.[1] as string);
    expect(written.repositories.map((r: { name: string }) => r.name)).toEqual(['first', 'third']);
  });
});
