import { describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { RecomputeGlobalConcurrencyUseCase } from '@/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.js';
import { StubProjectConfigGateway } from '@/tests/stubs/projectConfigGateway.stub.js';
import { StubQueueCapacityPort } from '@/tests/stubs/queueCapacityPort.stub.js';
import { StubRepositoriesListGateway } from '@/tests/stubs/repositoriesListGateway.stub.js';

function baseProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    github: false,
    gitlab: true,
    defaultModel: 'sonnet',
    reviewSkill: 'review-front',
    reviewFollowupSkill: 'review-followup',
    language: 'fr',
    retentionDays: 14,
    ...overrides,
  };
}

function makeUseCase(
  repositoriesListGateway: StubRepositoriesListGateway,
  projectConfigGateway: StubProjectConfigGateway,
  queueCapacityPort: StubQueueCapacityPort,
): RecomputeGlobalConcurrencyUseCase {
  return new RecomputeGlobalConcurrencyUseCase({
    repositoriesListGateway,
    projectConfigGateway,
    queueCapacityPort,
  });
}

describe('RecomputeGlobalConcurrencyUseCase', () => {
  it('sums explicit caps across declared repositories (2 + 3 + 1 = 6)', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    repositoriesList.set([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: true },
      { name: 'C', localPath: '/repos/C', enabled: true },
    ]);
    const projectConfig = new StubProjectConfigGateway();
    projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
    projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 3 }));
    projectConfig.set('/repos/C', baseProjectConfig({ maxConcurrentReviews: 1 }));
    const port = new StubQueueCapacityPort();

    const result = makeUseCase(repositoriesList, projectConfig, port).execute({});

    expect(result.totalCapacity).toBe(6);
    expect(port.globalConcurrency).toBe(6);
    expect(port.projectCaps.get('/repos/A')).toBe(2);
    expect(port.projectCaps.get('/repos/B')).toBe(3);
    expect(port.projectCaps.get('/repos/C')).toBe(1);
  });

  it('falls back to default 2 for projects without maxConcurrentReviews', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    repositoriesList.set([{ name: 'A', localPath: '/repos/A', enabled: true }]);
    const projectConfig = new StubProjectConfigGateway();
    projectConfig.set('/repos/A', baseProjectConfig());
    const port = new StubQueueCapacityPort();

    const result = makeUseCase(repositoriesList, projectConfig, port).execute({});

    expect(result.totalCapacity).toBe(2);
    expect(port.projectCaps.get('/repos/A')).toBe(2);
  });

  it('falls back to default 2 for projects whose config is not found', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    repositoriesList.set([{ name: 'orphan', localPath: '/repos/orphan', enabled: true }]);
    const projectConfig = new StubProjectConfigGateway();
    const port = new StubQueueCapacityPort();

    const result = makeUseCase(repositoriesList, projectConfig, port).execute({});

    expect(result.totalCapacity).toBe(2);
    expect(port.projectCaps.get('/repos/orphan')).toBe(2);
  });

  it('returns 0 capacity but seeds global concurrency to at least 1 when no projects', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    const projectConfig = new StubProjectConfigGateway();
    const port = new StubQueueCapacityPort();

    const result = makeUseCase(repositoriesList, projectConfig, port).execute({});

    expect(result.totalCapacity).toBe(0);
    expect(port.globalConcurrency).toBe(1);
  });

  it('grows total when a project is added on next execute call', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    const projectConfig = new StubProjectConfigGateway();
    const port = new StubQueueCapacityPort();
    repositoriesList.set([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: true },
    ]);
    projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
    projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 3 }));
    const useCase = makeUseCase(repositoriesList, projectConfig, port);
    expect(useCase.execute({}).totalCapacity).toBe(5);

    repositoriesList.set([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: true },
      { name: 'C', localPath: '/repos/C', enabled: true },
    ]);
    projectConfig.set('/repos/C', baseProjectConfig({ maxConcurrentReviews: 3 }));

    expect(useCase.execute({}).totalCapacity).toBe(8);
  });

  it('shrinks total when a project is removed on next execute call', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    const projectConfig = new StubProjectConfigGateway();
    const port = new StubQueueCapacityPort();
    repositoriesList.set([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: true },
      { name: 'C', localPath: '/repos/C', enabled: true },
    ]);
    projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
    projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 3 }));
    projectConfig.set('/repos/C', baseProjectConfig({ maxConcurrentReviews: 3 }));
    const useCase = makeUseCase(repositoriesList, projectConfig, port);
    expect(useCase.execute({}).totalCapacity).toBe(8);

    repositoriesList.set([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: true },
    ]);

    expect(useCase.execute({}).totalCapacity).toBe(5);
  });

  it('includes disabled projects in the total (spec: all declared projects)', () => {
    const repositoriesList = new StubRepositoriesListGateway();
    repositoriesList.set([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: false },
    ]);
    const projectConfig = new StubProjectConfigGateway();
    projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
    projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 4 }));
    const port = new StubQueueCapacityPort();

    const result = makeUseCase(repositoriesList, projectConfig, port).execute({});

    expect(result.totalCapacity).toBe(6);
  });
});
