import type { FastifyPluginAsync } from 'fastify';

import type { ProjectConfigGateway } from '@/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.js';
import type {
  ReviewFileGateway,
  ReviewFileInfo,
} from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import {
  OverviewPresenter,
  type OverviewActiveJobInput,
  type OverviewProjectConfigSummary,
  type OverviewProjectStatsEntry,
  type OverviewProjectStatsSummary,
} from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';

interface OverviewRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  getActiveJobs: () => OverviewActiveJobInput[];
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
  projectConfigGateway?: ProjectConfigGateway;
  getCapacity?: () => { running: number; max: number };
}

function buildSummary(stats: ProjectStats): OverviewProjectStatsSummary {
  return {
    totalReviews: stats.totalReviews,
    averageScore: stats.averageScore,
    averageDuration: stats.averageDuration,
    totalBlocking: stats.totalBlocking,
    totalWarnings: stats.totalWarnings,
  };
}

function collectProjectConfigs(
  gateway: ProjectConfigGateway | undefined,
  repositories: RepositoryConfig[],
): Record<string, OverviewProjectConfigSummary> | undefined {
  if (!gateway) return undefined;
  const summaries: Record<string, OverviewProjectConfigSummary> = {};
  for (const repository of repositories) {
    const result = gateway.read(repository.localPath);
    if (
      result.status === 'ok' &&
      typeof result.config.externalLink === 'string' &&
      result.config.externalLink.length > 0
    ) {
      summaries[repository.localPath] = { externalLink: result.config.externalLink };
    }
  }
  return summaries;
}

export const overviewRoutes: FastifyPluginAsync<OverviewRoutesOptions> = async (
  fastify,
  options,
) => {
  const presenter = new OverviewPresenter();

  fastify.get('/api/overview', async () => {
    const repositories = options.getRepositories();
    const enabledRepositories = repositories.filter((repository) => repository.enabled);

    const projectStats: OverviewProjectStatsEntry[] = [];
    const recentReviews: ReviewFileInfo[] = [];

    for (const repository of enabledRepositories) {
      const stats = options.statsGateway.loadProjectStats(repository.localPath);
      if (stats) {
        projectStats.push({
          project: repository.name,
          path: repository.localPath,
          stats,
          summary: buildSummary(stats),
        });
      }
      const reviews = await options.reviewFileGateway.listReviews(repository.localPath);
      recentReviews.push(...reviews);
    }

    const projectConfigs = collectProjectConfigs(options.projectConfigGateway, repositories);
    const capacity = options.getCapacity ? options.getCapacity() : { running: 0, max: 0 };

    return presenter.present({
      repositories,
      activeJobs: options.getActiveJobs(),
      projectStats,
      recentReviews,
      projectConfigs,
      capacity,
    });
  });
};
