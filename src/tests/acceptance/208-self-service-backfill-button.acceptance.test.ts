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

async function waitForBackfill(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('Self-service backfill button (acceptance)', () => {
  describe('triggering the backfill from the dashboard populates missing reviews', () => {
    it('gitlab project: fetches against the project identifier and populates reviews', async () => {
      const statsGateway = new InMemoryStatsGateway();
      const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
      diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });

      const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10, diffStats: null })];
      statsGateway.saveProjectStats(
        '/repos/main-app-v3/frontend',
        ProjectStatsFactory.create({ reviews }),
      );

      const fastify = Fastify();
      await fastify.register(statsRoutes, {
        statsGateway,
        getRepositories: () => [
          { localPath: '/repos/main-app-v3/frontend', name: 'frontend', enabled: true },
        ],
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        gitRemoteGateway: new StubGitRemoteGateway('git@gitlab.com:group/proj.git', 'gitlab'),
        broadcastBackfillProgress: vi.fn(),
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/repos/main-app-v3/frontend', backfill: true },
      });

      expect(response.statusCode).toBe(200);
      await waitForBackfill();

      const saved = statsGateway.loadProjectStats('/repos/main-app-v3/frontend');
      expect(saved?.reviews[0].diffStats).toEqual({
        commitsCount: 3,
        additions: 100,
        deletions: 20,
      });
      expect(saved?.totalAdditions).toBe(100);
      expect(saved?.totalDeletions).toBe(20);
      expect(saved?.diffStatsReviewCount).toBe(1);
    });

    it('forwards the platform project identifier to the gateway, not the local path', async () => {
      const statsGateway = new InMemoryStatsGateway();
      const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
      diffStatsFetchGateway.setResponse(10, { commitsCount: 1, additions: 5, deletions: 1 });

      const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10, diffStats: null })];
      statsGateway.saveProjectStats(
        '/repos/main-app-v3/frontend',
        ProjectStatsFactory.create({ reviews }),
      );

      const fastify = Fastify();
      await fastify.register(statsRoutes, {
        statsGateway,
        getRepositories: () => [
          { localPath: '/repos/main-app-v3/frontend', name: 'frontend', enabled: true },
        ],
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        gitRemoteGateway: new StubGitRemoteGateway('git@gitlab.com:group/proj.git', 'gitlab'),
        broadcastBackfillProgress: vi.fn(),
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/repos/main-app-v3/frontend', backfill: true },
      });

      await waitForBackfill();

      expect(diffStatsFetchGateway.lastProjectIdentifier).toBe('group/proj');
    });
  });

  describe('a project whose platform cannot be resolved is rejected with a clear message', () => {
    it('remote missing: rejects with 422 and "Plateforme du projet introuvable"', async () => {
      const statsGateway = new InMemoryStatsGateway();
      const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

      const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10, diffStats: null })];
      statsGateway.saveProjectStats('/repos/local-only', ProjectStatsFactory.create({ reviews }));

      const fastify = Fastify();
      await fastify.register(statsRoutes, {
        statsGateway,
        getRepositories: () => [
          { localPath: '/repos/local-only', name: 'local-only', enabled: true },
        ],
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        gitRemoteGateway: new StubGitRemoteGateway(null, 'unknown'),
        broadcastBackfillProgress: vi.fn(),
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/repos/local-only', backfill: true },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Plateforme du projet introuvable');
    });
  });

  describe('reviews already populated are left untouched', () => {
    it('nothing missing: fetches nothing and leaves totals unchanged', async () => {
      const statsGateway = new InMemoryStatsGateway();
      const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

      const reviews = [
        ReviewStatsFactory.withDiffStats(
          { commitsCount: 2, additions: 50, deletions: 10 },
          { id: 'r1', mrNumber: 10 },
        ),
      ];
      statsGateway.saveProjectStats(
        '/repos/main-app-v3/frontend',
        ProjectStatsFactory.withReviews(reviews),
      );
      const before = statsGateway.loadProjectStats('/repos/main-app-v3/frontend');
      const totalAdditionsBefore = before?.totalAdditions;
      const totalDeletionsBefore = before?.totalDeletions;

      const fastify = Fastify();
      await fastify.register(statsRoutes, {
        statsGateway,
        getRepositories: () => [
          { localPath: '/repos/main-app-v3/frontend', name: 'frontend', enabled: true },
        ],
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        gitRemoteGateway: new StubGitRemoteGateway('git@gitlab.com:group/proj.git', 'gitlab'),
        broadcastBackfillProgress: vi.fn(),
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/repos/main-app-v3/frontend', backfill: true },
      });

      await waitForBackfill();

      expect(diffStatsFetchGateway.fetchCallCount).toBe(0);
      const after = statsGateway.loadProjectStats('/repos/main-app-v3/frontend');
      expect(after?.totalAdditions).toBe(totalAdditionsBefore);
      expect(after?.totalDeletions).toBe(totalDeletionsBefore);
    });
  });
});
