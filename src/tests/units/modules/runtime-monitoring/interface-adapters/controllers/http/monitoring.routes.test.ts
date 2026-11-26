import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import type { MonitoringSnapshot } from '@/modules/runtime-monitoring/entities/monitoringSnapshot/monitoringSnapshot.js';
import { monitoringRoutes } from '@/modules/runtime-monitoring/interface-adapters/controllers/http/monitoring.routes.js';
import { MonitoringFactory } from '@/tests/factories/monitoring.factory.js';

const snapshot: MonitoringSnapshot = {
  sampledAt: '2026-11-26T10:00:00.000Z',
  server: {
    status: 'ok',
    uptimeSeconds: 60,
    version: '3.57.0',
    supervisor: { state: 'up', reason: null, lastCheckedAt: null },
  },
  process: { pid: 1, memory: MonitoringFactory.serverRuntime().memory, cpuPercent: 12.5 },
  host: MonitoringFactory.serverRuntime().host,
  sessions: { available: true, resourcesAvailable: true, items: [] },
};

describe('monitoring routes', () => {
  it('GET /api/monitoring returns the snapshot without caching', async () => {
    const application = Fastify();
    await application.register(monitoringRoutes, {
      getMonitoringSnapshot: { execute: async () => snapshot },
    });

    const response = await application.inject({ method: 'GET', url: '/api/monitoring' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual(snapshot);
    await application.close();
  });
});
