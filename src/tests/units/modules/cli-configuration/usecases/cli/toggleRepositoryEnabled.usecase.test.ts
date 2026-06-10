import { describe, it, expect, vi } from 'vitest';

import {
  ToggleRepositoryEnabledUseCase,
  type ToggleRepositoryEnabledDependencies,
} from '@/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.js';

function baseConfig(repositories: Array<{ name: string; localPath: string; enabled: boolean }>) {
  return {
    server: { port: 3847 },
    user: { gitlabUsername: '', githubUsername: '' },
    queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
    repositories,
  };
}

function createFakeDeps(
  overrides?: Partial<ToggleRepositoryEnabledDependencies>,
): ToggleRepositoryEnabledDependencies {
  return {
    readFileSync: vi.fn(() =>
      JSON.stringify(baseConfig([{ name: 'project', localPath: '/repos/project', enabled: true }])),
    ),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    ...overrides,
  };
}

describe('ToggleRepositoryEnabledUseCase', () => {
  it('enables an entry currently disabled and persists the new state', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({
      readFileSync: vi.fn(() =>
        JSON.stringify(
          baseConfig([{ name: 'project', localPath: '/repos/project', enabled: false }]),
        ),
      ),
      writeFileSync,
    });
    const usecase = new ToggleRepositoryEnabledUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      localPath: '/repos/project',
      enabled: true,
    });

    expect(result.updated?.enabled).toBe(true);
    const written = JSON.parse(writeFileSync.mock.calls[0]?.[1] as string);
    expect(written.repositories[0].enabled).toBe(true);
  });

  it('disables an entry currently enabled and persists the new state', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({ writeFileSync });
    const usecase = new ToggleRepositoryEnabledUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      localPath: '/repos/project',
      enabled: false,
    });

    expect(result.updated?.enabled).toBe(false);
    const written = JSON.parse(writeFileSync.mock.calls[0]?.[1] as string);
    expect(written.repositories[0].enabled).toBe(false);
  });

  it('returns updated=null and does not write when localPath is unknown', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({ writeFileSync });
    const usecase = new ToggleRepositoryEnabledUseCase(deps);

    const result = usecase.execute({
      configPath: '/config/config.json',
      localPath: '/repos/missing',
      enabled: false,
    });

    expect(result.updated).toBeNull();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('preserves the other fields of the toggled entry', () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDeps({ writeFileSync });
    const usecase = new ToggleRepositoryEnabledUseCase(deps);

    usecase.execute({
      configPath: '/config/config.json',
      localPath: '/repos/project',
      enabled: false,
    });

    const written = JSON.parse(writeFileSync.mock.calls[0]?.[1] as string);
    expect(written.repositories[0].name).toBe('project');
    expect(written.repositories[0].localPath).toBe('/repos/project');
  });

  it('throws when config file does not exist', () => {
    const deps = createFakeDeps({ existsSync: vi.fn(() => false) });
    const usecase = new ToggleRepositoryEnabledUseCase(deps);

    expect(() =>
      usecase.execute({
        configPath: '/missing/config.json',
        localPath: '/repos/project',
        enabled: false,
      }),
    ).toThrow();
  });
});
