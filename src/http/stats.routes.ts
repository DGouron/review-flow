import type { FastifyPluginAsync } from 'fastify';
import type { StatsGateway } from '../interface-adapters/gateways/stats.gateway.js';
import { getStatsSummary } from '../services/statsService.js';

interface StatsRoutesOptions {
  statsGateway: StatsGateway;
  getRepositories: () => Array<{ localPath: string; name: string; enabled: boolean }>;
}

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async (
  fastify,
  opts
) => {
  const { statsGateway, getRepositories } = opts;

  fastify.get('/api/stats', async (request) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

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
        });
      }
    }

    return { projects: allStats };
  });
};
