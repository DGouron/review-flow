import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';
import {
  repositoriesRoutes,
  type RepositoriesRoutesOptions,
} from '@/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

async function buildApp(repositories: RepositoryConfig[]): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(repositoriesRoutes, {
    getRepositories: () => repositories,
    addRepository: () => ({ status: 'ok', repositories }),
    removeRepository: () => ({ status: 'ok', repositories }),
    patchRepository: () => ({ status: 'ok', repositories }),
  });
  return app;
}

interface BuildOptions {
  repositories: RepositoryConfig[];
  addRepository?: RepositoriesRoutesOptions['addRepository'];
  removeRepository?: RepositoriesRoutesOptions['removeRepository'];
  patchRepository?: RepositoriesRoutesOptions['patchRepository'];
}

async function buildCustomApp(options: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(repositoriesRoutes, {
    getRepositories: () => options.repositories,
    addRepository:
      options.addRepository ?? (() => ({ status: 'ok', repositories: options.repositories })),
    removeRepository:
      options.removeRepository ?? (() => ({ status: 'ok', repositories: options.repositories })),
    patchRepository:
      options.patchRepository ?? (() => ({ status: 'ok', repositories: options.repositories })),
  });
  return app;
}

describe('repositoriesRoutes — GET /api/repositories', () => {
  it('returns the projected list of repositories', async () => {
    const app = await buildApp([
      RepositoryConfigFactory.create({
        name: 'frontend',
        localPath: '/repos/frontend',
        platform: 'gitlab',
        enabled: true,
      }),
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      repositories: Array<{
        name: string;
        localPath: string;
        platform: string;
        enabled: boolean;
        remoteUrl: string;
      }>;
    };
    expect(body.repositories).toEqual([
      {
        name: 'frontend',
        localPath: '/repos/frontend',
        platform: 'gitlab',
        enabled: true,
        remoteUrl: 'https://gitlab.com/org/sample-project',
      },
    ]);

    await app.close();
  });

  it('returns disabled repositories alongside enabled ones', async () => {
    const app = await buildApp([
      RepositoryConfigFactory.create({
        name: 'enabled-repo',
        localPath: '/repos/enabled',
        enabled: true,
      }),
      RepositoryConfigFactory.create({
        name: 'disabled-repo',
        localPath: '/repos/disabled',
        enabled: false,
      }),
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    const body = response.json() as { repositories: Array<{ name: string; enabled: boolean }> };
    expect(body.repositories.map((repository) => repository.enabled)).toEqual([true, false]);

    await app.close();
  });

  it('returns an empty array when no repository is configured', async () => {
    const app = await buildApp([]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ repositories: [] });

    await app.close();
  });

  it('exposes the repository platform so the dashboard can label tabs', async () => {
    const app = await buildApp([
      RepositoryConfigFactory.create({ name: 'gh-repo', platform: 'github' }),
      RepositoryConfigFactory.create({ name: 'gl-repo', platform: 'gitlab' }),
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    const body = response.json() as { repositories: Array<{ name: string; platform: string }> };
    expect(body.repositories.find((repository) => repository.name === 'gh-repo')?.platform).toBe(
      'github',
    );
    expect(body.repositories.find((repository) => repository.name === 'gl-repo')?.platform).toBe(
      'gitlab',
    );

    await app.close();
  });
});

describe('repositoriesRoutes — POST /api/repositories', () => {
  it('creates a repository and returns the updated list with status 200', async () => {
    const repositories: RepositoryConfig[] = [];
    const app = await buildCustomApp({
      repositories,
      addRepository: ({ localPath }) => {
        const added = RepositoryConfigFactory.create({ name: 'new-app', localPath });
        repositories.push(added);
        return { status: 'ok', repositories };
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: { localPath: '/home/dev/new-app' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { repositories: Array<{ name: string; localPath: string }> };
    expect(body.repositories).toHaveLength(1);
    expect(body.repositories[0]?.localPath).toBe('/home/dev/new-app');

    await app.close();
  });

  it('rejects with 400 "Chemin du projet requis" when localPath is empty', async () => {
    const app = await buildCustomApp({ repositories: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: { localPath: '' },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('Chemin du projet requis');

    await app.close();
  });

  it('rejects with 400 "Le chemin doit être absolu" when localPath is relative', async () => {
    const app = await buildCustomApp({ repositories: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: { localPath: 'projects/app' },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('Le chemin doit être absolu');

    await app.close();
  });

  it('rejects with 400 "Dossier introuvable" when the adapter returns not-a-directory', async () => {
    const app = await buildCustomApp({
      repositories: [],
      addRepository: () => ({ status: 'not-a-directory' }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: { localPath: '/tmp/does-not-exist' },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('Dossier introuvable');

    await app.close();
  });

  it('rejects with 409 "Projet déjà ajouté" when the adapter reports a duplicate', async () => {
    const app = await buildCustomApp({
      repositories: [RepositoryConfigFactory.create({ localPath: '/home/dev/main-app-v3' })],
      addRepository: () => ({ status: 'duplicate' }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: { localPath: '/home/dev/main-app-v3' },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('Projet déjà ajouté');

    await app.close();
  });

  it('rejects with 500 "Échec de l\'écriture de la configuration" when adapter reports write failure', async () => {
    const app = await buildCustomApp({
      repositories: [],
      addRepository: () => ({ status: 'write-failed' }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: { localPath: '/home/dev/app' },
    });

    expect(response.statusCode).toBe(500);
    expect((response.json() as { error: string }).error).toBe(
      "Échec de l'écriture de la configuration",
    );

    await app.close();
  });

  it('rejects with 400 when the body is missing localPath', async () => {
    const app = await buildCustomApp({ repositories: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

describe('repositoriesRoutes — DELETE /api/repositories', () => {
  it('removes a repository and returns the updated list with status 200', async () => {
    const repositories = [
      RepositoryConfigFactory.create({ name: 'keep', localPath: '/home/dev/keep' }),
      RepositoryConfigFactory.create({ name: 'drop', localPath: '/home/dev/drop' }),
    ];
    const app = await buildCustomApp({
      repositories,
      removeRepository: ({ localPath }) => {
        const index = repositories.findIndex((repository) => repository.localPath === localPath);
        if (index < 0) return { status: 'not-found' };
        repositories.splice(index, 1);
        return { status: 'ok', repositories };
      },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/drop'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { repositories: Array<{ localPath: string }> };
    expect(body.repositories.map((repository) => repository.localPath)).toEqual(['/home/dev/keep']);

    await app.close();
  });

  it('rejects with 404 "Projet introuvable" when adapter reports not-found', async () => {
    const app = await buildCustomApp({
      repositories: [],
      removeRepository: () => ({ status: 'not-found' }),
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/repositories?localPath=' + encodeURIComponent('/nope'),
    });

    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('Projet introuvable');

    await app.close();
  });

  it('rejects with 400 when the localPath query string is missing', async () => {
    const app = await buildCustomApp({ repositories: [] });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/repositories',
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

describe('repositoriesRoutes — PATCH /api/repositories', () => {
  it('disables a repository and returns 200', async () => {
    const repositories = [
      RepositoryConfigFactory.create({ localPath: '/home/dev/x', enabled: true }),
    ];
    const app = await buildCustomApp({
      repositories,
      patchRepository: ({ localPath, enabled }) => {
        const target = repositories.find((repository) => repository.localPath === localPath);
        if (!target) return { status: 'not-found' };
        target.enabled = enabled;
        return { status: 'ok', repositories };
      },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/x'),
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(repositories[0]?.enabled).toBe(false);

    await app.close();
  });

  it('enables a repository and returns 200', async () => {
    const repositories = [
      RepositoryConfigFactory.create({ localPath: '/home/dev/x', enabled: false }),
    ];
    const app = await buildCustomApp({
      repositories,
      patchRepository: ({ localPath, enabled }) => {
        const target = repositories.find((repository) => repository.localPath === localPath);
        if (!target) return { status: 'not-found' };
        target.enabled = enabled;
        return { status: 'ok', repositories };
      },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/x'),
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(200);
    expect(repositories[0]?.enabled).toBe(true);

    await app.close();
  });

  it('rejects with 404 when the adapter reports not-found', async () => {
    const app = await buildCustomApp({
      repositories: [],
      patchRepository: () => ({ status: 'not-found' }),
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/repositories?localPath=' + encodeURIComponent('/nope'),
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('rejects with 400 when the body is missing enabled boolean', async () => {
    const app = await buildCustomApp({ repositories: [] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/x'),
      payload: { enabled: 'not-a-boolean' },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('rejects with 400 when the localPath query string is missing', async () => {
    const app = await buildCustomApp({ repositories: [] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/repositories',
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});
