import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';
import type { RunSweepNowResult } from '@/modules/worktree-management/entities/sweep/runSweepResult.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type {
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { WorktreeHealthReport } from '@/modules/worktree-management/entities/worktree/worktreeHealth.schema.js';
import type { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import type { ForceCleanupLockService } from '@/modules/worktree-management/services/forceCleanupLock.js';

export interface WorktreeSchedulerControls {
  getLastSweep: () => LastSweepSummary | null;
  getNextSweepEta: () => Date;
  runSweepNow: () => Promise<RunSweepNowResult>;
}

export interface WorktreeOverviewRoutesOptions {
  worktreeGateway: WorktreeGateway;
  presenter: WorktreePanelPresenter;
  schedulerControls: WorktreeSchedulerControls | null;
  logger: Logger;
  detectDegradedWorktrees?: (entries: WorktreeEntry[]) => Promise<WorktreeHealthReport[]>;
  forceCleanupLock?: ForceCleanupLockService;
  removeWorktreeForCleanup?: (identity: WorktreeIdentity) => Promise<RemoveResult>;
}

const cleanupPayloadSchema = z.object({
  platform: z.enum(['gitlab', 'github']),
  projectPath: z.string().min(1),
  mrNumber: z.number().int().positive(),
});

function buildLockKey(identity: WorktreeIdentity): string {
  return `${identity.platform}:${identity.projectPath}:${identity.mrNumber}`;
}

export const worktreeOverviewRoutes: FastifyPluginAsync<WorktreeOverviewRoutesOptions> = async (
  fastify,
  opts,
) => {
  const {
    worktreeGateway,
    presenter,
    schedulerControls,
    logger,
    detectDegradedWorktrees,
    forceCleanupLock,
    removeWorktreeForCleanup,
  } = opts;

  fastify.get('/api/worktrees', async (_request, reply) => {
    if (schedulerControls === null) {
      reply.code(503);
      return { error: 'scheduler-unavailable' };
    }

    const worktrees = await worktreeGateway.list();
    const healthReports = detectDegradedWorktrees ? await detectDegradedWorktrees(worktrees) : [];
    const viewModel = await presenter.present({
      worktrees,
      lastSweep: schedulerControls.getLastSweep(),
      nextSweepAt: schedulerControls.getNextSweepEta(),
      healthReports,
    });
    return viewModel;
  });

  fastify.post('/api/worktrees/sweep', async (_request, reply) => {
    if (schedulerControls === null) {
      reply.code(503);
      return { error: 'scheduler-unavailable' };
    }

    const result = await schedulerControls.runSweepNow();
    if (result.status === 'conflict') {
      reply.code(409);
      return { error: 'sweep-in-progress', startedAt: result.startedAt.toISOString() };
    }
    if (result.status === 'error') {
      logger.error({ reason: result.reason }, 'Manual worktree sweep failed');
      reply.code(500);
      return { error: 'sweep-failed' };
    }
    return {
      ranAt: result.summary.ranAt.toISOString(),
      removed: result.summary.removed,
      failures: result.summary.failures,
      scanned: result.summary.scanned,
    };
  });

  fastify.post('/api/worktrees/cleanup', async (request, reply) => {
    if (forceCleanupLock === undefined || removeWorktreeForCleanup === undefined) {
      reply.code(503);
      return { error: 'cleanup-unavailable' };
    }

    const parsed = cleanupPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid-payload' };
    }

    const identity: WorktreeIdentity = {
      platform: parsed.data.platform,
      projectPath: parsed.data.projectPath,
      mrNumber: parsed.data.mrNumber,
    };
    const lockKey = buildLockKey(identity);

    if (!forceCleanupLock.tryAcquire(lockKey)) {
      reply.code(409);
      return { error: 'cleanup-in-progress' };
    }

    try {
      const result = await removeWorktreeForCleanup(identity);
      if (result.status === 'failed') {
        logger.warn({ identity, warning: result.warning }, 'Force cleanup failed');
        reply.code(500);
        return { error: 'cleanup-failed', warning: result.warning };
      }
      logger.info({ identity, outcome: result.status }, 'Force cleanup completed');
      return { status: 'removed' };
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      logger.warn({ identity, warning }, 'Force cleanup threw');
      reply.code(500);
      return { error: 'cleanup-failed', warning };
    } finally {
      forceCleanupLock.release(lockKey);
    }
  });
};
