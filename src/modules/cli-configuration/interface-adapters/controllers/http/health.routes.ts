import type { FastifyPluginAsync } from 'fastify';

import { getQueueStats, getJobsStatus } from '@/frameworks/queue/pQueueAdapter.js';
import type { VersionCachePort } from '@/modules/cli-configuration/entities/packageVersion/versionCache.gateway.js';
import type { SupervisorStatusStore } from '@/modules/supervisor-management/entities/supervisor/supervisorStatusStore.gateway.js';

interface HealthRoutesOptions {
  getConfig: () => { version: string };
  versionCache?: VersionCachePort;
  supervisorStatusStore?: SupervisorStatusStore;
}

interface SupervisorHealthBlock {
  state: 'up' | 'down' | 'unknown';
  reason: string | null;
  lastCheckedAt: string | null;
}

function buildSupervisorBlock(store: SupervisorStatusStore | undefined): SupervisorHealthBlock {
  if (!store) {
    return { state: 'unknown', reason: null, lastCheckedAt: null };
  }
  const current = store.read();
  const lastCheckedAt =
    current.lastCheckedAt.getTime() === 0 ? null : current.lastCheckedAt.toISOString();
  return {
    state: current.state,
    reason: current.reason,
    lastCheckedAt,
  };
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (fastify, opts) => {
  const { getConfig } = opts;

  fastify.get('/health', async () => {
    const supervisor = buildSupervisorBlock(opts.supervisorStatusStore);
    const status = supervisor.state === 'down' ? 'degraded' : 'ok';
    return {
      status,
      timestamp: new Date().toISOString(),
      supervisor,
    };
  });

  fastify.get('/api/status', async () => {
    const queueStats = getQueueStats();
    const jobs = getJobsStatus();
    const config = getConfig();
    const versionCheck = opts.versionCache?.get() ?? null;

    return {
      status: 'running',
      version: config.version,
      queue: queueStats,
      jobs,
      timestamp: new Date().toISOString(),
      latestVersion: versionCheck?.latestVersion ?? null,
      updateAvailable: versionCheck?.updateAvailable ?? false,
      versionCheckedAt: versionCheck?.checkedAt ?? null,
    };
  });
};
