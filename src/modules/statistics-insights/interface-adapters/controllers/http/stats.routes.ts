import type { FastifyPluginAsync } from 'fastify';

import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';
import { safeParseRecalculateBody } from '@/modules/statistics-insights/entities/stats/recalculateBody.guard.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { BugsByCategoryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.js';
import { getStatsSummary } from '@/modules/statistics-insights/services/statsService.js';
import { recalculateWithBackfill } from '@/modules/statistics-insights/usecases/stats/recalculateWithBackfill.usecase.js';

interface RepositoryInfo {
  localPath: string;
  name: string;
  enabled: boolean;
  platform?: string;
}

interface StatsRoutesOptions {
  statsGateway: StatsGateway;
  getRepositories: () => RepositoryInfo[];
  diffStatsFetchGateways?: { gitlab: DiffStatsFetchGateway; github: DiffStatsFetchGateway };
  broadcastBackfillProgress?: (progress: BackfillProgress) => void;
  logger?: {
    warn: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
  };
}

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async (fastify, options) => {
  const { statsGateway, getRepositories } = options;
  const bugsByCategoryPresenter = new BugsByCategoryPresenter();

  fastify.get<{ Querystring: { path?: string } }>('/api/stats', async (request) => {
    const projectPath = request.query.path?.trim();

    if (projectPath) {
      if (!projectPath.startsWith('/') || projectPath.includes('..')) {
        return { error: 'Invalid path' };
      }

      const stats = statsGateway.loadProjectStats(projectPath);
      if (!stats) {
        return { stats: null, summary: null };
      }

      return {
        stats,
        summary: getStatsSummary(stats),
        bugsByCategory: bugsByCategoryPresenter.present(stats),
      };
    }

    const allStats = [];
    for (const repo of getRepositories()) {
      if (!repo.enabled) continue;
      const stats = statsGateway.loadProjectStats(repo.localPath);
      if (stats) {
        allStats.push({
          project: repo.name,
          path: repo.localPath,
          stats,
          summary: getStatsSummary(stats),
          bugsByCategory: bugsByCategoryPresenter.present(stats),
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

    const { diffStatsFetchGateways, broadcastBackfillProgress, logger } = options;
    const noopLogger = { warn: () => {}, error: () => {} };

    recalculateWithBackfill(
      {
        projectPath,
        shouldBackfill,
        platform: repository.platform ?? null,
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
