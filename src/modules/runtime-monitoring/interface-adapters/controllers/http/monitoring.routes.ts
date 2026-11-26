import type { FastifyPluginAsync } from 'fastify';

import type { GetMonitoringSnapshotUseCase } from '@/modules/runtime-monitoring/usecases/getMonitoringSnapshot.usecase.js';

export interface MonitoringRoutesOptions {
  getMonitoringSnapshot: Pick<GetMonitoringSnapshotUseCase, 'execute'>;
}

/**
 * GET /api/monitoring — live resources of the server and of its review sessions (SPEC-234).
 */
export const monitoringRoutes: FastifyPluginAsync<MonitoringRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/api/monitoring', async (_request, reply) => {
    const snapshot = await options.getMonitoringSnapshot.execute();
    return reply.header('cache-control', 'no-store').send(snapshot);
  });
};
