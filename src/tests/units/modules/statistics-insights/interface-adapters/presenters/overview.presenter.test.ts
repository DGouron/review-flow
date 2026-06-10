import { describe, expect, it } from 'vitest';

import { OverviewPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { ProjectStatsApiResponseFactory } from '@/tests/factories/projectStatsApiResponse.factory.js';
import { RecentReviewFileFactory } from '@/tests/factories/recentReviewFile.factory.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

const NOW = new Date('2026-05-25T12:00:00.000Z');

describe('OverviewPresenter', () => {
  describe('empty inputs', () => {
    it('marks every section as empty with French messages', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items).toEqual([]);
      expect(viewModel.activeReviews.isEmpty).toBe(true);
      expect(viewModel.activeReviews.emptyMessage).toBe('Aucune review en cours');
      expect(viewModel.projectCards.items).toEqual([]);
      expect(viewModel.projectCards.isEmpty).toBe(true);
      expect(viewModel.projectCards.emptyMessage).toBe('Aucun projet configuré');
      expect(viewModel.recentReviewsFeed.items).toEqual([]);
      expect(viewModel.recentReviewsFeed.isEmpty).toBe(true);
      expect(viewModel.recentReviewsFeed.emptyMessage).toBe('Aucune review récente');
    });
  });

  describe('active reviews', () => {
    it('formats one running review with elapsed time and resolves project name from localPath', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const startedFiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
        ],
        activeJobs: [
          {
            id: 'gitlab:frontend:142',
            mrNumber: 142,
            project: '/repos/frontend',
            mrUrl: 'https://gitlab.com/org/frontend/-/merge_requests/142',
            status: 'running',
            startedAt: startedFiveMinutesAgo,
            jobType: 'review',
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items).toHaveLength(1);
      const entry = viewModel.activeReviews.items[0];
      expect(entry?.jobId).toBe('gitlab:frontend:142');
      expect(entry?.projectName).toBe('frontend');
      expect(entry?.mrNumber).toBe(142);
      expect(entry?.mrPrefix).toBe('MR');
      expect(entry?.mrUrl).toBe('https://gitlab.com/org/frontend/-/merge_requests/142');
      expect(entry?.elapsedLabel).toBe('5m');
    });

    it('orders active reviews by startedAt DESC (most recent first)', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const startedTenMinutesAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
      const startedTwoMinutesAgo = new Date(NOW.getTime() - 2 * 60_000).toISOString();

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'older', localPath: '/repos/older' }),
          RepositoryConfigFactory.create({ name: 'newer', localPath: '/repos/newer' }),
        ],
        activeJobs: [
          {
            id: 'older-job',
            mrNumber: 1,
            project: '/repos/older',
            mrUrl: 'https://example.com/1',
            status: 'running',
            startedAt: startedTenMinutesAgo,
          },
          {
            id: 'newer-job',
            mrNumber: 2,
            project: '/repos/newer',
            mrUrl: 'https://example.com/2',
            status: 'running',
            startedAt: startedTwoMinutesAgo,
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items.map((item) => item.jobId)).toEqual([
        'newer-job',
        'older-job',
      ]);
    });

    it('uses PR prefix when the job runs on a GitHub project', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
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
            startedAt: new Date(NOW.getTime() - 60_000).toISOString(),
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items[0]?.mrPrefix).toBe('PR');
    });

    it('falls back to "—" elapsedLabel when startedAt is null', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [
          {
            id: 'queued-job',
            mrNumber: 5,
            project: '/repos/frontend',
            mrUrl: 'https://example.com/5',
            status: 'queued',
            startedAt: null,
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items[0]?.elapsedLabel).toBe('—');
    });

    it('falls back to "—" elapsedLabel when startedAt is an unparseable date string', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [
          {
            id: 'broken-date-job',
            mrNumber: 9,
            project: '/repos/frontend',
            mrUrl: 'https://example.com/9',
            status: 'running',
            startedAt: 'not-a-date',
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items[0]?.elapsedLabel).toBe('—');
    });

    it('falls back to "—" projectName when the job localPath matches no repository', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [
          {
            id: 'orphan-job',
            mrNumber: 7,
            project: '/repos/unknown',
            mrUrl: 'https://example.com/7',
            status: 'running',
            startedAt: new Date(NOW.getTime() - 60_000).toISOString(),
          },
        ],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.activeReviews.items[0]?.projectName).toBe('—');
      expect(viewModel.activeReviews.items[0]?.mrPrefix).toBe('MR');
    });
  });

  describe('project cards', () => {
    it('builds a card per repository with totals from projectStats and the last 10 scores as sparkline points', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const reviews = Array.from({ length: 12 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `r-${index}`,
          timestamp: new Date(NOW.getTime() - (12 - index) * 60_000).toISOString(),
          mrNumber: index,
          score: index + 1,
        }),
      );

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [],
        projectStats: [
          ProjectStatsApiResponseFactory.create({
            project: 'frontend',
            path: '/repos/frontend',
            totalReviews: 12,
            averageScore: 7.2,
            reviews,
          }),
        ],
        recentReviews: [],
      });

      expect(viewModel.projectCards.items).toHaveLength(1);
      const card = viewModel.projectCards.items[0];
      expect(card?.projectName).toBe('frontend');
      expect(card?.projectPath).toBe('/repos/frontend');
      expect(card?.totalReviews).toBe(12);
      expect(card?.averageScoreLabel).toBe('7.2');
      expect(card?.sparklinePoints).toHaveLength(10);
      expect(card?.sparklinePoints[0]).toBe(3);
      expect(card?.sparklinePoints[9]).toBe(12);
      expect(card?.isEmptyHistory).toBe(false);
    });

    it('renders a card with 0 reviews, score "-", and empty sparkline when a project has no history', () => {
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

      const card = viewModel.projectCards.items[0];
      expect(card?.totalReviews).toBe(0);
      expect(card?.averageScoreLabel).toBe('-');
      expect(card?.sparklinePoints).toEqual([]);
      expect(card?.isEmptyHistory).toBe(true);
    });

    it('still renders the card when the repository has no stats entry yet', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'orphan', localPath: '/repos/orphan' }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.projectCards.items).toHaveLength(1);
      expect(viewModel.projectCards.items[0]?.totalReviews).toBe(0);
      expect(viewModel.projectCards.items[0]?.averageScoreLabel).toBe('-');
    });

    it('ignores scores that are null when building sparkline points', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [],
        projectStats: [
          ProjectStatsApiResponseFactory.create({
            project: 'frontend',
            path: '/repos/frontend',
            totalReviews: 3,
            averageScore: 7,
            reviews: [
              ReviewStatsFactory.create({
                id: 'a',
                timestamp: '2026-05-25T11:58:00.000Z',
                score: 6,
              }),
              ReviewStatsFactory.create({
                id: 'b',
                timestamp: '2026-05-25T11:59:00.000Z',
                score: null,
              }),
              ReviewStatsFactory.create({
                id: 'c',
                timestamp: '2026-05-25T12:00:00.000Z',
                score: 8,
              }),
            ],
          }),
        ],
        recentReviews: [],
      });

      expect(viewModel.projectCards.items[0]?.sparklinePoints).toEqual([6, 8]);
    });
  });

  describe('recent reviews feed', () => {
    it('orders entries by mtime DESC and caps the feed at 10 items', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });
      const items = Array.from({ length: 12 }, (_, index) =>
        RecentReviewFileFactory.create({
          filename: `2026-05-25-MR-${index}.md`,
          path: `/repos/frontend/.claude/reviews/2026-05-25-MR-${index}.md`,
          mrNumber: String(index),
          mtime: new Date(NOW.getTime() - (12 - index) * 60_000).toISOString(),
        }),
      );

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: items,
      });

      expect(viewModel.recentReviewsFeed.items).toHaveLength(10);
      expect(viewModel.recentReviewsFeed.items[0]?.filename).toBe('2026-05-25-MR-11.md');
      expect(viewModel.recentReviewsFeed.items[9]?.filename).toBe('2026-05-25-MR-2.md');
    });

    it('resolves project name from the file path when it matches a configured repository localPath', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
          RepositoryConfigFactory.create({ name: 'api', localPath: '/repos/api' }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [
          RecentReviewFileFactory.create({
            filename: '2026-05-25-MR-1.md',
            path: '/repos/frontend/.claude/reviews/2026-05-25-MR-1.md',
            mrNumber: '1',
            mtime: '2026-05-25T11:59:00.000Z',
          }),
          RecentReviewFileFactory.create({
            filename: '2026-05-25-PR-2.md',
            path: '/repos/api/.claude/reviews/2026-05-25-PR-2.md',
            mrNumber: '2',
            type: 'PR',
            mtime: '2026-05-25T11:58:00.000Z',
          }),
        ],
      });

      expect(viewModel.recentReviewsFeed.items[0]?.projectName).toBe('frontend');
      expect(viewModel.recentReviewsFeed.items[0]?.mrPrefix).toBe('MR');
      expect(viewModel.recentReviewsFeed.items[1]?.projectName).toBe('api');
      expect(viewModel.recentReviewsFeed.items[1]?.mrPrefix).toBe('PR');
    });

    it('falls back to "—" project name when no repository localPath matches the review file path', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [],
        projectStats: [],
        recentReviews: [
          RecentReviewFileFactory.create({
            path: '/unknown/.claude/reviews/2026-05-25-MR-1.md',
            mrNumber: '1',
            mtime: '2026-05-25T11:59:00.000Z',
          }),
        ],
        // empty repositories with one review means we still want to render
        // a row but cannot derive a project label
      });

      expect(viewModel.recentReviewsFeed.items[0]?.projectName).toBe('—');
    });
  });

  describe('headerCapacity (SPEC-186)', () => {
    it('formats label as "running / max" and marks saturation when running >= max', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        capacity: { running: 5, max: 5 },
      });

      expect(viewModel.headerCapacity.label).toBe('5 / 5');
      expect(viewModel.headerCapacity.runningCount).toBe(5);
      expect(viewModel.headerCapacity.totalCapacity).toBe(5);
      expect(viewModel.headerCapacity.isSaturated).toBe(true);
    });

    it('marks not saturated when running < max', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        capacity: { running: 3, max: 5 },
      });

      expect(viewModel.headerCapacity.label).toBe('3 / 5');
      expect(viewModel.headerCapacity.isSaturated).toBe(false);
    });

    it('defaults to "0 / 0" not saturated when capacity is not provided', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.headerCapacity.label).toBe('0 / 0');
      expect(viewModel.headerCapacity.isSaturated).toBe(false);
    });
  });

  describe('externalLink propagation (SPEC-179)', () => {
    it('forwards externalLink from the input projectConfigs into the matching project card', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        projectConfigs: {
          '/repos/frontend': { externalLink: 'https://notion.so/team/frontend' },
        },
      });

      expect(viewModel.projectCards.items[0]?.externalLink).toBe('https://notion.so/team/frontend');
    });

    it('omits externalLink when the projectConfigs map has no entry for the project', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        projectConfigs: {},
      });

      expect(viewModel.projectCards.items[0]?.externalLink).toBeUndefined();
    });

    it('omits externalLink when projectConfigs is not provided (backward compat)', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
      });

      expect(viewModel.projectCards.items[0]?.externalLink).toBeUndefined();
    });

    it('forwards externalLink into a card that has a stats entry with history', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
        ],
        activeJobs: [],
        projectStats: [
          ProjectStatsApiResponseFactory.create({
            project: 'frontend',
            path: '/repos/frontend',
            totalReviews: 1,
            averageScore: 8,
            reviews: [
              ReviewStatsFactory.create({
                id: 'r1',
                timestamp: '2026-05-25T11:59:00.000Z',
                score: 8,
              }),
            ],
          }),
        ],
        recentReviews: [],
        projectConfigs: {
          '/repos/frontend': { externalLink: 'https://notion.so/team/frontend' },
        },
      });

      const card = viewModel.projectCards.items[0];
      expect(card?.totalReviews).toBe(1);
      expect(card?.isEmptyHistory).toBe(false);
      expect(card?.externalLink).toBe('https://notion.so/team/frontend');
    });

    it('omits externalLink when the projectConfigs entry holds an empty string', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({
            name: 'frontend',
            localPath: '/repos/frontend',
            platform: 'gitlab',
          }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        projectConfigs: {
          '/repos/frontend': { externalLink: '' },
        },
      });

      expect(viewModel.projectCards.items[0]?.externalLink).toBeUndefined();
    });
  });

  describe('recent review title fallback', () => {
    it('falls back to an empty title when the review file has no title', () => {
      const presenter = new OverviewPresenter({ now: () => NOW });

      const viewModel = presenter.present({
        repositories: [
          RepositoryConfigFactory.create({ name: 'frontend', localPath: '/repos/frontend' }),
        ],
        activeJobs: [],
        projectStats: [],
        recentReviews: [
          RecentReviewFileFactory.create({
            path: '/repos/frontend/.claude/reviews/2026-05-25-MR-1.md',
            mrNumber: '1',
            mtime: '2026-05-25T11:59:00.000Z',
            title: undefined,
          }),
        ],
      });

      expect(viewModel.recentReviewsFeed.items[0]?.title).toBe('');
    });
  });
});
