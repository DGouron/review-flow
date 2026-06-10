import { describe, expect, it } from 'vitest';

import { RepositoriesListRuntimeConfigGateway } from '@/modules/cli-configuration/interface-adapters/gateways/repositoriesList.runtimeConfig.gateway.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

describe('RepositoriesListRuntimeConfigGateway', () => {
  it('maps RepositoryConfig entries to DeclaredRepository projections (name + localPath + enabled)', () => {
    const gateway = new RepositoriesListRuntimeConfigGateway(() => [
      RepositoryConfigFactory.create({ name: 'A', localPath: '/repos/A', enabled: true }),
      RepositoryConfigFactory.create({ name: 'B', localPath: '/repos/B', enabled: false }),
    ]);

    const declared = gateway.list();

    expect(declared).toEqual([
      { name: 'A', localPath: '/repos/A', enabled: true },
      { name: 'B', localPath: '/repos/B', enabled: false },
    ]);
  });

  it('returns the current list each call (no caching of the initial snapshot)', () => {
    let repositories = [
      RepositoryConfigFactory.create({ name: 'A', localPath: '/repos/A', enabled: true }),
    ];
    const gateway = new RepositoriesListRuntimeConfigGateway(() => repositories);

    expect(gateway.list()).toHaveLength(1);

    repositories = [
      RepositoryConfigFactory.create({ name: 'A', localPath: '/repos/A', enabled: true }),
      RepositoryConfigFactory.create({ name: 'B', localPath: '/repos/B', enabled: true }),
    ];

    expect(gateway.list()).toHaveLength(2);
  });
});
