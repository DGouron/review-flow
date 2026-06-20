import type { FastifyPluginAsync } from 'fastify';

import type { GitRemoteGateway } from '@/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';
import { resolveProjectIdentifier } from '@/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.js';
import { safeParseRecalculateBody } from '@/modules/statistics-insights/entities/stats/recalculateBody.guard.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { AnalyticsHeaderPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.js';
import { BugsByCategoryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.js';
import { KeyInsightsPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.js';
import { StatsSummaryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.js';
import { GetProjectStatsUseCase } from '@/modules/statistics-insights/usecases/stats/getProjectStats.usecase.js';
import { recalculateWithBackfill } from '@/modules/statistics-insights/usecases/stats/recalculateWithBackfill.usecase.js';

interface RepositoryInfo {
  localPath: string;
  name: string;
  enabled: boolean;
}

interface StatsRoutesOptions {
  statsGateway: StatsGateway;
  getRepositories: () => RepositoryInfo[];
  gitRemoteGateway?: GitRemoteGateway;
  diffStatsFetchGateways?: { gitlab: DiffStatsFetchGateway; github: DiffStatsFetchGateway };
  broadcastBackfillProgress?: (progress: BackfillProgress) => void;
  logger?: {
    warn: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
  };
}

interface ResolvedProject {
  platform: string;
  projectIdentifier: string;
}

function resolveBackfillTarget(
  localPath: string,
  gitRemoteGateway: GitRemoteGateway,
): ResolvedProject | null {
  const remote = gitRemoteGateway.getOriginRemote(localPath);
  if (!remote) {
    return null;
  }

  const platform = gitRemoteGateway.detectPlatform(remote);
  const projectIdentifier = resolveProjectIdentifier(remote);
  if (platform === 'unknown' || projectIdentifier === null) {
    return null;
  }

  return { platform, projectIdentifier };
}

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async (fastify, options) => {
  const { statsGateway, getRepositories } = options;
  const bugsByCategoryPresenter = new BugsByCategoryPresenter();
  const analyticsHeaderPresenter = new AnalyticsHeaderPresenter();
  const keyInsightsPresenter = new KeyInsightsPresenter();
  const statsSummaryPresenter = new StatsSummaryPresenter();
  const getProjectStatsUseCase = new GetProjectStatsUseCase(statsGateway);

  fastify.get<{ Querystring: { path?: string } }>('/api/stats', async (request) => {
    const projectPath = request.query.path?.trim();

    if (projectPath) {
      if (!projectPath.startsWith('/') || projectPath.includes('..')) {
        return { error: 'Invalid path' };
      }

      const stats = getProjectStatsUseCase.execute({ projectPath });
      if (!stats) {
        return { stats: null, summary: null };
      }

      return {
        stats,
        summary: statsSummaryPresenter.present(stats),
        bugsByCategory: bugsByCategoryPresenter.present(stats),
        analyticsHeader: analyticsHeaderPresenter.present(stats, new Date()),
        keyInsights: keyInsightsPresenter.present(stats, new Date()),
      };
    }

    const allStats = [];
    for (const repo of getRepositories()) {
      if (!repo.enabled) continue;
      const stats = getProjectStatsUseCase.execute({ projectPath: repo.localPath });
      if (stats) {
        allStats.push({
          project: repo.name,
          path: repo.localPath,
          stats,
          summary: statsSummaryPresenter.present(stats),
          bugsByCategory: bugsByCategoryPresenter.present(stats),
          analyticsHeader: analyticsHeaderPresenter.present(stats, new Date()),
          keyInsights: keyInsightsPresenter.present(stats, new Date()),
        });
      }
    }

    return { projects: allStats };
  });

  fastify.post('/api/stats/recalculate', async (request, reply) => {
    const parseResult = safeParseRecalculateBody(request.body);
    const body = parseResult.success ? parseResult.data : null;
    const projectPath = typeof body?.path === 'string' ? body.path.trim() : '';
    const shouldBackfill = body?.backfill === true;

    if (!projectPath) {
      reply.status(400).send({ error: 'Chemin du projet requis' });
      return;
    }

    const repositories = getRepositories();
    const repository = repositories.find((repo) => repo.enabled && repo.localPath === projectPath);

    if (!repository) {
      reply.status(404).send({ error: 'Projet non trouvé dans la configuration' });
      return;
    }

    const { diffStatsFetchGateways, gitRemoteGateway, broadcastBackfillProgress, logger } = options;
    const noopLogger = { warn: () => {}, error: () => {} };

    const resolved =
      shouldBackfill && gitRemoteGateway
        ? resolveBackfillTarget(repository.localPath, gitRemoteGateway)
        : null;

    if (shouldBackfill && resolved === null) {
      reply.status(422).send({ error: 'Plateforme du projet introuvable' });
      return;
    }

    recalculateWithBackfill(
      {
        projectPath,
        shouldBackfill,
        platform: resolved?.platform ?? null,
        projectIdentifier: resolved?.projectIdentifier ?? null,
      },
      {
        statsGateway,
        diffStatsFetchGateways: diffStatsFetchGateways ?? null,
        onProgress: (progress) => {
          broadcastBackfillProgress?.(progress);
        },
        logger: logger ? { warn: logger.warn, error: logger.error } : noopLogger,
      },
    );

    return { status: 'started' };
  });
};
