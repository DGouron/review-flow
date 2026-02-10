import type { FastifyPluginAsync } from 'fastify';
import { getQueueStats, getJobsStatus } from '../../../frameworks/queue/pQueueAdapter.js';

interface HealthRoutesOptions {
  getConfig: () => { version?: string };
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  fastify,
  opts
) => {
  const { getConfig } = opts;

  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/api/status', async () => {
    const queueStats = getQueueStats();
    const jobs = getJobsStatus();
    const config = getConfig();

    return {
      status: 'running',
      version: config.version || '1.0.0',
      queue: queueStats,
      jobs,
      timestamp: new Date().toISOString(),
    };
  });
};
