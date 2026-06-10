/**
 * SPEC-91 — Dashboard Multi-Project Overview
 *
 * Outer-loop acceptance test (SDD): exercises the new GET /api/repositories
 * endpoint and the OverviewPresenter aggregation end-to-end without infra
 * (no DB, no real CLI). Covers Scenarios 2, 4, 6, 9, 10, 12 plus the
 * /api/repositories shape per docs/specs/91-dashboard-multi-project-overview.md.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { repositoriesRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.js';
import { OverviewPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { ProjectStatsApiResponseFactory } from '@/tests/factories/projectStatsApiResponse.factory.js';
import { RecentReviewFileFactory } from '@/tests/factories/recentReviewFile.factory.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

const NOW = new Date('2026-05-25T12:00:00.000Z');

async function buildAcceptanceApp(
  repositories: ReturnType<typeof RepositoryConfigFactory.create>[],
): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(repositoriesRoutes, {
    getRepositories: () => repositories,
    addRepository: () => ({ status: 'ok', repositories }),
    removeRepository: () => ({ status: 'ok', repositories }),
    patchRepository: () => ({ status: 'ok', repositories }),
  });
  return app;
}

describe('Acceptance — SPEC-91: Dashboard Multi-Project Overview', () => {
  describe('GET /api/repositories — tab bar data source', () => {
    it('returns enabled and disabled repos with name, localPath, platform, enabled', async () => {
      const repositories = [
        RepositoryConfigFactory.create({
          name: 'frontend',
          localPath: '/repos/frontend',
          platform: 'gitlab',
          enabled: true,
        }),
        RepositoryConfigFactory.create({
          name: 'api',
          localPath: '/repos/api',
          platform: 'github',
          enabled: false,
        }),
      ];
      const app = await buildAcceptanceApp(repositories);

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
      expect(body.repositories).toHaveLength(2);
      expect(body.repositories[0]).toEqual({
        name: 'frontend',
        localPath: '/repos/frontend',
        platform: 'gitlab',
        enabled: true,
        remoteUrl: 'https://gitlab.com/org/sample-project',
      });
      expect(body.repositories[1]).toEqual({
        name: 'api',
        localPath: '/repos/api',
        platform: 'github',
        enabled: false,
        remoteUrl: 'https://gitlab.com/org/sample-project',
      });

      await app.close();
    });

    it('returns empty array when no repositories configured', async () => {
      const app = await buildAcceptanceApp([]);

      const response = await app.inject({ method: 'GET', url: '/api/repositories' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { repositories: unknown[] };
      expect(body.repositories).toEqual([]);

      await app.close();
    });
  });

  describe('OverviewPresenter — aggregation across projects', () => {
    it('Scenario 2: active reviews across all projects, ordered by startedAt DESC', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const startedSevenMinutesAgo = new Date(NOW.getTime() - 7 * 60_000).toISOString();
      const startedThreeMinutesAgo = new Date(NOW.getTime() - 3 * 60_000).toISOString();

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
          RepositoryConfigFactory.create({
            name: 'api',
            localPath: '/repos/api',
            platform: 'github',
          }),
        ],
        activeJobs: [
          {
            id: 'github:api:28',
            mrNumber: 28,
            project: '/repos/api',
            mrUrl: 'https://github.com/org/api/pull/28',
            status: 'running',
            startedAt: startedSevenMinutesAgo,
            title: 'feat: new endpoint',
            jobType: 'review',
          },
          {
            id: 'gitlab:frontend:142',
            mrNumber: 142,
            project: '/repos/frontend',
            mrUrl: 'https://gitlab.com/org/frontend/-/merge_requests/142',
            status: 'running',
            startedAt: startedThreeMinutesAgo,
            title: 'feat: dashboard',
            jobType: 'review',
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items).toHaveLength(2);
      expect(viewModel.activeReviews.items[0]?.projectName).toBe('frontend');
      expect(viewModel.activeReviews.items[0]?.mrNumber).toBe(142);
      expect(viewModel.activeReviews.items[0]?.mrPrefix).toBe('MR');
      expect(viewModel.activeReviews.items[0]?.elapsedLabel).toBe('3m');
      expect(viewModel.activeReviews.items[1]?.projectName).toBe('api');
      expect(viewModel.activeReviews.items[1]?.mrNumber).toBe(28);
      expect(viewModel.activeReviews.items[1]?.mrPrefix).toBe('PR');
      expect(viewModel.activeReviews.items[1]?.elapsedLabel).toBe('7m');
      expect(viewModel.activeReviews.isEmpty).toBe(false);
    });

    it('Scenario 4: project cards with total reviews, average score, and sparkline points', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const frontendReviews = Array.from({ length: 12 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `frontend-${index}`,
          timestamp: new Date(NOW.getTime() - (12 - index) * 60_000).toISOString(),
          mrNumber: 100 + index,
          score: 7,
        }),
      );
      const apiReviews = Array.from({ length: 8 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `api-${index}`,
          timestamp: new Date(NOW.getTime() - (8 - index) * 60_000).toISOString(),
          mrNumber: 20 + index,
          score: 8,
        }),
      );

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
          RepositoryConfigFactory.create({ name: 'api', localPath: '/repos/api' }),
        ],
        activeJobs: [],
        projectStats: [
          ProjectStatsApiResponseFactory.create({
            project: 'frontend',
            path: '/repos/frontend',
            totalReviews: 12,
            averageScore: 7.2,
            reviews: frontendReviews,
          }),
          ProjectStatsApiResponseFactory.create({
            project: 'api',
            path: '/repos/api',
            totalReviews: 8,
            averageScore: 8.1,
            reviews: apiReviews,
          }),
        ],
        recentReviews: [],
      });

      expect(viewModel.projectCards.items).toHaveLength(2);
      const frontendCard = viewModel.projectCards.items.find(
        (card) => card.projectName === 'frontend',
      );
      const apiCard = viewModel.projectCards.items.find((card) => card.projectName === 'api');
      expect(frontendCard?.totalReviews).toBe(12);
      expect(frontendCard?.averageScoreLabel).toBe('7.2');
      expect(frontendCard?.sparklinePoints).toHaveLength(10);
      expect(apiCard?.totalReviews).toBe(8);
      expect(apiCard?.averageScoreLabel).toBe('8.1');
      expect(apiCard?.sparklinePoints).toHaveLength(8);
      expect(apiCard?.isEmptyHistory).toBe(false);
    });

    it('Scenario 6: recent reviews feed across projects, ordered DESC, capped at 10', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const recentReviews = Array.from({ length: 12 }, (_, index) =>
        RecentReviewFileFactory.create({
          filename: `2026-05-25-MR-${100 + index}.md`,
          path: `/repos/${index % 2 === 0 ? 'frontend' : 'api'}/.claude/reviews/2026-05-25-MR-${100 + index}.md`,
          mrNumber: String(100 + index),
          type: 'MR',
          mtime: new Date(NOW.getTime() - (12 - index) * 60_000).toISOString(),
          title: `Review ${index}`,
        }),
      );

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
          RepositoryConfigFactory.create({ name: 'api', localPath: '/repos/api' }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews,
      });

      expect(viewModel.recentReviewsFeed.items).toHaveLength(10);
      expect(viewModel.recentReviewsFeed.items[0]?.filename).toBe('2026-05-25-MR-111.md');
      expect(viewModel.recentReviewsFeed.items[0]?.projectName).toBe('api');
      expect(viewModel.recentReviewsFeed.items[0]?.mrPrefix).toBe('MR');
      expect(viewModel.recentReviewsFeed.isEmpty).toBe(false);
    });

    it('Scenario 9: no configured projects renders empty states with French messages', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.isEmpty).toBe(true);
      expect(viewModel.activeReviews.emptyMessage).toBe('Aucune review en cours');
      expect(viewModel.projectCards.isEmpty).toBe(true);
      expect(viewModel.projectCards.emptyMessage).toBe('Aucun projet configuré');
      expect(viewModel.recentReviewsFeed.isEmpty).toBe(true);
      expect(viewModel.recentReviewsFeed.emptyMessage).toBe('Aucune review récente');
    });

    it('Scenario 10: project with 0 reviews shows score "-" and empty sparkline', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'new-project', localPath: '/repos/new' }),
        ],
        activeJobs: [],
        projectStats: [
          ProjectStatsApiResponseFactory.create({
            project: 'new-project',
            path: '/repos/new',
            totalReviews: 0,
            averageScore: null,
            reviews: [],
          }),
        ],
        recentReviews: [],
      });

      expect(viewModel.projectCards.items).toHaveLength(1);
      const card = viewModel.projectCards.items[0];
      expect(card?.totalReviews).toBe(0);
      expect(card?.averageScoreLabel).toBe('-');
      expect(card?.sparklinePoints).toEqual([]);
      expect(card?.isEmptyHistory).toBe(true);
    });

    it('Scenario 12: review completes — moves from active to recent on next present()', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const startedAt = new Date(NOW.getTime() - 5 * 60_000).toISOString();

      const beforeCompletion = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [
          {
            id: 'gitlab:frontend:142',
            mrNumber: 142,
            project: '/repos/frontend',
            mrUrl: 'https://gitlab.com/org/frontend/-/merge_requests/142',
            status: 'running',
            startedAt,
            title: 'feat: dashboard',
            jobType: 'review',
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      const afterCompletion = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [
          RecentReviewFileFactory.create({
            filename: '2026-05-25-MR-142.md',
            path: '/repos/frontend/.claude/reviews/2026-05-25-MR-142.md',
            mrNumber: '142',
            type: 'MR',
            mtime: NOW.toISOString(),
            title: 'feat: dashboard',
          }),
        ],
      });

      expect(beforeCompletion.activeReviews.items).toHaveLength(1);
      expect(beforeCompletion.recentReviewsFeed.items).toHaveLength(0);
      expect(afterCompletion.activeReviews.items).toHaveLength(0);
      expect(afterCompletion.recentReviewsFeed.items).toHaveLength(1);
      expect(afterCompletion.recentReviewsFeed.items[0]?.mrNumber).toBe('142');
      expect(afterCompletion.recentReviewsFeed.items[0]?.projectName).toBe('frontend');
    });
  });
});
