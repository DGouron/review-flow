import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';

import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubDiffStatsFetchGateway } from '@/tests/stubs/diffStatsFetch.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

class StubGitRemoteGateway {
  constructor(
    private readonly remote: string | null,
    private readonly platform: Platform,
  ) {}

  isRepo(): boolean {
    return this.remote !== null;
  }

  getOriginRemote(): string | null {
    return this.remote;
  }

  detectPlatform(): Platform {
    return this.platform;
  }
}

function createTestOptions(overrides: Record<string, unknown> = {}) {
  const statsGateway = new InMemoryStatsGateway();
  const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

  return {
    statsGateway,
    getRepositories: () => [{ localPath: '/test/project', name: 'test', enabled: true }],
    diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
    gitRemoteGateway: new StubGitRemoteGateway('git@gitlab.com:group/proj.git', 'gitlab'),
    broadcastBackfillProgress: vi.fn(),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('POST /api/stats/recalculate', () => {
  it('should return started status when valid path is provided', async () => {
    const options = createTestOptions();
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 1 })];
    options.statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: false },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('started');
  });

  it('should return 404 when path is not found in repositories', async () => {
    const options = createTestOptions({
      getRepositories: () => [{ localPath: '/other/project', name: 'other', enabled: true }],
    });

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/unknown/project', backfill: false },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should return 400 when path is missing', async () => {
    const options = createTestOptions();

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { backfill: false },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should recalculate stats asynchronously', async () => {
    const options = createTestOptions();
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 6 }),
      ReviewStatsFactory.create({ id: 'r2', mrNumber: 2, score: 8 }),
    ];
    options.statsGateway.saveProjectStats(
      '/test/project',
      ProjectStatsFactory.create({
        reviews,
        averageScore: 0,
      }),
    );

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: false },
    });

    expect(response.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const saved = options.statsGateway.loadProjectStats('/test/project');
    expect(saved?.averageScore).toBe(7);
  });

  it('resolves the platform from the git remote, not from the config', async () => {
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
    diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });
    const options = createTestOptions({
      diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
      gitRemoteGateway: new StubGitRemoteGateway('git@gitlab.com:group/proj.git', 'gitlab'),
    });
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10, diffStats: null })];
    options.statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: true },
    });

    expect(response.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(diffStatsFetchGateway.lastProjectIdentifier).toBe('group/proj');
  });

  it('rejects with 422 when the git remote is missing', async () => {
    const options = createTestOptions({
      gitRemoteGateway: new StubGitRemoteGateway(null, 'unknown'),
    });

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: true },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Plateforme du projet introuvable');
  });

  it('rejects with 422 when the platform is unknown', async () => {
    const options = createTestOptions({
      gitRemoteGateway: new StubGitRemoteGateway('git@example.com:group/proj.git', 'unknown'),
    });

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: true },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Plateforme du projet introuvable');
  });

  it('rejects with 422 when the project identifier cannot be parsed', async () => {
    const options = createTestOptions({
      gitRemoteGateway: new StubGitRemoteGateway('not-a-url', 'gitlab'),
    });

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: true },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Plateforme du projet introuvable');
  });

  it('does not resolve the remote on the recompute-only path', async () => {
    const options = createTestOptions({
      gitRemoteGateway: new StubGitRemoteGateway(null, 'unknown'),
    });
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 7 })];
    options.statsGateway.saveProjectStats(
      '/test/project',
      ProjectStatsFactory.create({ reviews, averageScore: 0 }),
    );

    const fastify = Fastify();
    await fastify.register(statsRoutes, options);

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/stats/recalculate',
      payload: { path: '/test/project', backfill: false },
    });

    expect(response.statusCode).toBe(200);
  });
});
