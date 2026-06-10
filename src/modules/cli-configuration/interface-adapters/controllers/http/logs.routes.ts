import type { FastifyPluginAsync } from 'fastify';

import { getLogs, getErrorLogs } from '@/frameworks/logging/logBuffer.js';

export const logsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { errors?: string } }>('/api/logs', async (request) => {
    const logs = request.query.errors === 'true' ? getErrorLogs() : getLogs();
    return {
      logs,
      count: logs.length,
    };
  });
};
