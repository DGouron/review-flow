import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import type {
  ProjectConfigGateway,
  ProjectConfigReadResult,
} from '@/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.js';
import type {
  ReviewFileGateway,
  ReviewFileInfo,
} from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { overviewRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.js';
import type { OverviewViewModel } from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

function makeStats(reviews: ProjectStats['reviews']): ProjectStats {
  const scoredReviews = reviews.filter((review) => review.score !== null);
  const averageScore =
    scoredReviews.length === 0
      ? null
      : scoredReviews.reduce((sum, review) => sum + (review.score ?? 0), 0) / scoredReviews.length;
  return {
    totalReviews: reviews.length,
    totalDuration: 0,
    averageScore,
    averageDuration: 0,
    totalBlocking: 0,
    totalWarnings: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    averageAdditions: null,
    averageDeletions: null,
    reviews,
    lastUpdated: '2026-05-25T12:00:00.000Z',
  };
}

function makeReview(
  overrides: Partial<ProjectStats['reviews'][number]>,
): ProjectStats['reviews'][number] {
  return {
    id: 'review-1',
    timestamp: '2026-05-25T10:00:00.000Z',
    mrNumber: 1,
    duration: 60,
    score: 7,
    blocking: 0,
    warnings: 0,
    ...overrides,
  };
}

function makeReviewFile(overrides: Partial<ReviewFileInfo>): ReviewFileInfo {
  return {
    filename: '2026-05-25-MR-142.md',
    path: '/repos/frontend/.claude/reviews/2026-05-25-MR-142.md',
    date: '2026-05-25',
    mrNumber: '142',
    type: 'MR',
    size: 1024,
    mtime: '2026-05-25T14:05:00.000Z',
    ...overrides,
  };
}

function stubStatsGateway(byPath: Record<string, ProjectStats | null>): StatsGateway {
  return {
    loadProjectStats: (path: string) => byPath[path] ?? null,
  } as StatsGateway;
}

function stubReviewFileGateway(byPath: Record<string, ReviewFileInfo[]>): ReviewFileGateway {
  return {
    listReviews: async (path: string) => byPath[path] ?? [],
    readReview: async () => null,
    deleteReview: async () => false,
    reviewExists: async () => false,
    getReviewsDirectory: () => '',
  };
}

function stubProjectConfigGateway(byPath: Record<string, ProjectConfig>): ProjectConfigGateway {
  return {
    read: (path: string): ProjectConfigReadResult => {
      const config = byPath[path];
      if (!config) return { status: 'not-found' };
      return { status: 'ok', config };
    },
    write: () => ({ ok: true }),
  };
}

async function buildApp(options: {
  repositories: ReturnType<typeof RepositoryConfigFactory.create>[];
  activeJobs?: Array<{
    id: string;
    mrNumber: number;
    project: string;
    mrUrl: string;
    status: string;
    startedAt: string | null;
    jobType?: 'review' | 'followup';
  }>;
  statsByPath?: Record<string, ProjectStats | null>;
  reviewsByPath?: Record<string, ReviewFileInfo[]>;
  projectConfigsByPath?: Record<string, ProjectConfig>;
  getCapacity?: () => { running: number; max: number };
}): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(overviewRoutes, {
    getRepositories: () => options.repositories,
    getActiveJobs: () => options.activeJobs ?? [],
    statsGateway: stubStatsGateway(options.statsByPath ?? {}),
    reviewFileGateway: stubReviewFileGateway(options.reviewsByPath ?? {}),
    projectConfigGateway: options.projectConfigsByPath
      ? stubProjectConfigGateway(options.projectConfigsByPath)
      : undefined,
    getCapacity: options.getCapacity,
  });
  return app;
}

function makeProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
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

describe('overviewRoutes — GET /api/overview', () => {
  it('returns an empty view-model when no repository is configured', async () => {
    const app = await buildApp({ repositories: [] });

    const response = await app.inject({ method: 'GET', url: '/api/overview' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as OverviewViewModel;
    expect(body.activeReviews.isEmpty).toBe(true);
    expect(body.projectCards.isEmpty).toBe(true);
    expect(body.recentReviewsFeed.isEmpty).toBe(true);

    await app.close();
  });

  it('aggregates active jobs, project stats, and recent reviews', async () => {
    const app = await buildApp({
      repositories: [
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
          enabled: true,
        }),
      ],
      activeJobs: [
        {
          id: 'job-1',
          mrNumber: 142,
          project: '/repos/frontend',
          mrUrl: 'https://example.com/mr/142',
          status: 'running',
          startedAt: '2026-05-25T14:00:00.000Z',
        },
      ],
      statsByPath: {
        '/repos/frontend': makeStats([
          makeReview({ id: 'r-1', mrNumber: 100, timestamp: '2026-05-24T10:00:00.000Z', score: 7 }),
          makeReview({ id: 'r-2', mrNumber: 101, timestamp: '2026-05-25T10:00:00.000Z', score: 8 }),
        ]),
        '/repos/api': makeStats([]),
      },
      reviewsByPath: {
        '/repos/frontend': [makeReviewFile({ filename: '2026-05-25-MR-137.md', mrNumber: '137' })],
        '/repos/api': [
          makeReviewFile({
            filename: '2026-05-25-PR-28.md',
            path: '/repos/api/.claude/reviews/2026-05-25-PR-28.md',
            mrNumber: '28',
            type: 'PR',
            mtime: '2026-05-25T14:10:00.000Z',
          }),
        ],
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/overview' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as OverviewViewModel;

    expect(body.activeReviews.items).toHaveLength(1);
    expect(body.activeReviews.items[0]?.projectName).toBe('frontend');
    expect(body.activeReviews.items[0]?.mrPrefix).toBe('MR');

    expect(body.projectCards.items).toHaveLength(2);
    expect(body.projectCards.items[0]?.projectName).toBe('frontend');
    expect(body.projectCards.items[0]?.sparklinePoints).toEqual([7, 8]);
    expect(body.projectCards.items[1]?.projectName).toBe('api');
    expect(body.projectCards.items[1]?.isEmptyHistory).toBe(true);

    expect(body.recentReviewsFeed.items).toHaveLength(2);
    expect(body.recentReviewsFeed.items[0]?.filename).toBe('2026-05-25-PR-28.md');
    expect(body.recentReviewsFeed.items[0]?.mrPrefix).toBe('PR');

    await app.close();
  });

  it('skips disabled repositories when aggregating stats and reviews', async () => {
    const app = await buildApp({
      repositories: [
        RepositoryConfigFactory.create({
          name: 'enabled',
          localPath: '/repos/enabled',
          enabled: true,
        }),
        RepositoryConfigFactory.create({
          name: 'disabled',
          localPath: '/repos/disabled',
          enabled: false,
        }),
      ],
      statsByPath: {
        '/repos/disabled': makeStats([
          makeReview({ id: 'r-x', mrNumber: 99, timestamp: '2026-05-25T10:00:00.000Z', score: 5 }),
        ]),
      },
      reviewsByPath: {
        '/repos/disabled': [makeReviewFile({ filename: '2026-05-25-MR-99.md', mrNumber: '99' })],
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/overview' });

    const body = response.json() as OverviewViewModel;
    expect(body.recentReviewsFeed.items).toHaveLength(0);
    expect(
      body.projectCards.items.find((card) => card.projectName === 'disabled')?.isEmptyHistory,
    ).toBe(true);

    await app.close();
  });

  it('forwards externalLink from the projectConfigGateway into the project card (SPEC-179)', async () => {
    const app = await buildApp({
      repositories: [
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
          enabled: true,
        }),
      ],
      projectConfigsByPath: {
        '/repos/frontend': makeProjectConfig({ externalLink: 'https://notion.so/team/frontend' }),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/overview' });

    const body = response.json() as OverviewViewModel;
    const frontendCard = body.projectCards.items.find((card) => card.projectName === 'frontend');
    const apiCard = body.projectCards.items.find((card) => card.projectName === 'api');
    expect(frontendCard?.externalLink).toBe('https://notion.so/team/frontend');
    expect(apiCard?.externalLink).toBeUndefined();

    await app.close();
  });

  it('exposes headerCapacity from the injected getCapacity option (SPEC-186)', async () => {
    const app = await buildApp({
      repositories: [
        RepositoryConfigFactory.create({
          name: 'frontend',
          localPath: '/repos/frontend',
          enabled: true,
        }),
      ],
      getCapacity: () => ({ running: 3, max: 5 }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/overview' });

    const body = response.json() as OverviewViewModel;
    expect(body.headerCapacity.label).toBe('3 / 5');
    expect(body.headerCapacity.runningCount).toBe(3);
    expect(body.headerCapacity.totalCapacity).toBe(5);
    expect(body.headerCapacity.isSaturated).toBe(false);

    await app.close();
  });

  it('headerCapacity defaults to "0 / 0" when getCapacity is not provided', async () => {
    const app = await buildApp({
      repositories: [
        RepositoryConfigFactory.create({
          name: 'frontend',
          localPath: '/repos/frontend',
          enabled: true,
        }),
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/api/overview' });

    const body = response.json() as OverviewViewModel;
    expect(body.headerCapacity.label).toBe('0 / 0');
    expect(body.headerCapacity.isSaturated).toBe(false);

    await app.close();
  });
});
