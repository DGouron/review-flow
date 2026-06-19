import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

interface RepositoryInfo {
  localPath: string;
  name: string;
  enabled: boolean;
  platform?: string;
}

describe('stats routes', () => {
  let app: FastifyInstance;
  let statsGateway: InMemoryStatsGateway;
  let repositories: RepositoryInfo[];

  const register = async (extra: Record<string, unknown> = {}): Promise<void> => {
    await app.register(statsRoutes, {
      statsGateway,
      getRepositories: () => repositories,
      ...extra,
    });
    await app.ready();
  };

  beforeEach(() => {
    app = Fastify();
    statsGateway = new InMemoryStatsGateway();
    repositories = [];
  });

  describe('GET /api/stats with explicit path', () => {
    it('should reject a relative path', async () => {
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=relative/path',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ error: 'Invalid path' });
    });

    it('should reject a path containing directory traversal', async () => {
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/etc/../passwd',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ error: 'Invalid path' });
    });

    it('should return null stats and summary when project has no stats', async () => {
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/unknown/project',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ stats: null, summary: null });
    });

    it('should return stats and summary when project has stats', async () => {
      const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 8 })];
      statsGateway.saveProjectStats('/known/project', ProjectStatsFactory.withReviews(reviews));
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/known/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.stats).not.toBeNull();
      expect(body.stats.totalReviews).toBe(1);
      expect(body.summary).not.toBeNull();
    });

    it('should carry the sorted bugsByCategory view model in the single-project payload', async () => {
      statsGateway.saveProjectStats(
        '/known/project',
        ProjectStatsFactory.create({
          categoryBreakdown: {
            security: 3,
            logic: 5,
            performance: 0,
            typeSafety: 0,
            style: 1,
            dependencies: 0,
          },
        }),
      );
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/known/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.bugsByCategory.isEmpty).toBe(false);
      expect(
        body.bugsByCategory.bars.map((bar: { categoryKey: string }) => bar.categoryKey),
      ).toEqual(['logic', 'security', 'style', 'performance', 'typeSafety', 'dependencies']);
    });

    it('should carry the analyticsHeader view model in the single-project payload', async () => {
      statsGateway.saveProjectStats(
        '/known/project',
        ProjectStatsFactory.create({
          totalReviews: 43,
          totalBlocking: 16,
          totalWarnings: 41,
          averageDuration: 252000,
        }),
      );
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/known/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.analyticsHeader.isEmpty).toBe(false);
      expect(body.analyticsHeader.prsReviewed.value).toBe(43);
      expect(body.analyticsHeader.bugsCaught.value).toBe(57);
      expect(body.analyticsHeader.averageReviewTime.value).toBe('4m');
    });

    it('should flag the empty analyticsHeader state when the project has no reviews', async () => {
      statsGateway.saveProjectStats('/empty/project', ProjectStatsFactory.create());
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/empty/project',
      });

      const body = response.json();
      expect(body.analyticsHeader.isEmpty).toBe(true);
      expect(body.analyticsHeader.emptyMessage).toBe('Aucune review enregistrée');
    });

    it('should flag the empty bugsByCategory state when no category data exists', async () => {
      statsGateway.saveProjectStats('/empty/project', ProjectStatsFactory.create());
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=/empty/project',
      });

      const body = response.json();
      expect(body.bugsByCategory.isEmpty).toBe(true);
      expect(body.bugsByCategory.emptyMessage).toBe('Aucune donnée de catégorie disponible');
    });

    it('should treat a whitespace-only path as no path and list projects', async () => {
      await register();

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats?path=%20%20',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: [] });
    });
  });

  describe('GET /api/stats listing all repositories', () => {
    it('should skip disabled repositories', async () => {
      repositories = [{ localPath: '/disabled/project', name: 'Disabled', enabled: false }];
      statsGateway.saveProjectStats('/disabled/project', ProjectStatsFactory.withReviews([]));
      await register();

      const response = await app.inject({ method: 'GET', url: '/api/stats' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: [] });
    });

    it('should skip enabled repositories without stats', async () => {
      repositories = [{ localPath: '/enabled/no-stats', name: 'NoStats', enabled: true }];
      await register();

      const response = await app.inject({ method: 'GET', url: '/api/stats' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: [] });
    });

    it('should include enabled repositories with stats', async () => {
      repositories = [{ localPath: '/enabled/with-stats', name: 'WithStats', enabled: true }];
      const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 7 })];
      statsGateway.saveProjectStats(
        '/enabled/with-stats',
        ProjectStatsFactory.withReviews(reviews),
      );
      await register();

      const response = await app.inject({ method: 'GET', url: '/api/stats' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].project).toBe('WithStats');
      expect(body.projects[0].path).toBe('/enabled/with-stats');
      expect(body.projects[0].summary).toBeDefined();
      expect(body.projects[0].bugsByCategory).toBeDefined();
      expect(body.projects[0].bugsByCategory.bars).toHaveLength(6);
      expect(body.projects[0].analyticsHeader).toBeDefined();
      expect(body.projects[0].analyticsHeader.prsReviewed.value).toBe(1);
      expect(body.projects[0].analyticsHeader.reviewsPerMonth).toHaveLength(12);
    });
  });

  describe('POST /api/stats/recalculate', () => {
    it('should return 400 when body is missing the path', async () => {
      await register();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Chemin du projet requis' });
    });

    it('should return 400 when the body fails validation', async () => {
      await register();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: 123 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Chemin du projet requis' });
    });

    it('should return 400 when the path is only whitespace', async () => {
      await register();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '   ' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 when the project is not in the configuration', async () => {
      repositories = [];
      await register();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/missing/project' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Projet non trouvé dans la configuration' });
    });

    it('should return 404 when the matching repository is disabled', async () => {
      repositories = [{ localPath: '/disabled/project', name: 'Disabled', enabled: false }];
      await register();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/disabled/project' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should start recalculation for an enabled repository without optional dependencies', async () => {
      repositories = [{ localPath: '/enabled/project', name: 'Enabled', enabled: true }];
      statsGateway.saveProjectStats('/enabled/project', ProjectStatsFactory.withReviews([]));
      await register();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/enabled/project' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'started' });
    });

    it('should start recalculation and forward progress through broadcast and logger', async () => {
      repositories = [
        { localPath: '/enabled/project', name: 'Enabled', enabled: true, platform: 'github' },
      ];
      statsGateway.saveProjectStats('/enabled/project', ProjectStatsFactory.withReviews([]));

      const progressEvents: unknown[] = [];
      const warnings: string[] = [];
      const errors: string[] = [];

      await register({
        broadcastBackfillProgress: (progress: unknown) => {
          progressEvents.push(progress);
        },
        logger: {
          warn: (message: string) => warnings.push(message),
          info: (_message: string) => {},
          error: (message: string) => errors.push(message),
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/stats/recalculate',
        payload: { path: '/enabled/project', backfill: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'started' });
    });
  });
});
