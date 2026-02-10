import type { FastifyPluginAsync } from 'fastify';
import { getLogs, getErrorLogs } from '../../../frameworks/logging/logBuffer.js';

export const logsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/logs', async (request) => {
    const query = request.query as { errors?: string };
    const logs = query.errors === 'true' ? getErrorLogs() : getLogs();
    return {
      logs,
      count: logs.length,
    };
  });
};
