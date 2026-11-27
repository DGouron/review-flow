import type { Logger } from 'pino';

import type { SweepRoleSessionsResult } from '@/modules/claude-invocation/usecases/sweepRoleSessions.usecase.js';
import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';
import type { RunSweepNowResult } from '@/modules/worktree-management/entities/sweep/runSweepResult.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type {
  SweepRepository,
  SweepTrackingGateway,
} from '@/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.js';
import { sweepStaleWorktrees } from '@/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.js';

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 86_400_000;

export interface WorktreeSweepSchedulerDependencies {
  worktreeGateway: WorktreeGateway;
  trackingGateway: SweepTrackingGateway;
  getRepositories: () => SweepRepository[];
  logger: Logger;
  now: () => Date;
  sweepRoleSessions?: () => Promise<SweepRoleSessionsResult>;
}

export interface WorktreeSweepSchedulerHandle {
  stop: () => void;
  getLastSweep: () => LastSweepSummary | null;
  getNextSweepEta: () => Date;
  runSweepNow: () => Promise<RunSweepNowResult>;
}

export function startWorktreeSweepScheduler(
  dependencies: WorktreeSweepSchedulerDependencies,
): WorktreeSweepSchedulerHandle {
  const { worktreeGateway, trackingGateway, getRepositories, logger, now } = dependencies;

  let lastSummary: LastSweepSummary | null = null;
  let runningSince: Date | null = null;
  const startedAt: Date = now();

  async function sweepRoleSessionsSafely(): Promise<void> {
    if (!dependencies.sweepRoleSessions) return;
    try {
      const result = await dependencies.sweepRoleSessions();
      if (result.status === 'failed') {
        logger.warn({ reason: result.reason }, 'Role session sweep failed');
        return;
      }
      const touched = result.outcomes.filter((outcome) => outcome.action !== 'kept');
      if (touched.length > 0) logger.info({ outcomes: touched }, 'Role session sweep completed');
    } catch (error) {
      logger.error({ error }, 'Role session sweep failed');
    }
  }

  async function runSweepInternal(): Promise<LastSweepSummary> {
    const ranAt = now();
    runningSince = ranAt;
    try {
      await sweepRoleSessionsSafely();
      const summary = await sweepStaleWorktrees({
        listEntries: () => worktreeGateway.list(),
        removeWorktree: async (identity) => {
          const repositories = getRepositories();
          const firstEnabled = repositories.find((repository) => repository.enabled);
          const sourceCheckoutPath = firstEnabled?.localPath ?? '';
          return worktreeGateway.remove({ identity, sourceCheckoutPath });
        },
        trackingGateway,
        getRepositories,
        now,
      });

      const result: LastSweepSummary = { ranAt, ...summary };
      lastSummary = result;

      if (summary.removed > 0 || summary.failures > 0) {
        logger.info({ ...summary }, 'Worktree sweep completed');
      }

      return result;
    } finally {
      runningSince = null;
    }
  }

  async function runScheduledSweep(): Promise<void> {
    try {
      await runSweepInternal();
    } catch (error) {
      logger.error({ error }, 'Worktree sweep failed');
    }
  }

  void runScheduledSweep();

  const intervalId = setInterval(() => {
    void runScheduledSweep();
  }, TWENTY_FOUR_HOURS_IN_MILLISECONDS);

  return {
    stop: () => clearInterval(intervalId),
    getLastSweep: () => lastSummary,
    getNextSweepEta: () => {
      const reference = lastSummary?.ranAt ?? startedAt;
      return new Date(reference.getTime() + TWENTY_FOUR_HOURS_IN_MILLISECONDS);
    },
    runSweepNow: async (): Promise<RunSweepNowResult> => {
      if (runningSince !== null) {
        return { status: 'conflict', startedAt: runningSince };
      }
      try {
        const summary = await runSweepInternal();
        return { status: 'ok', summary };
      } catch (error) {
        logger.error({ error }, 'Manual worktree sweep failed');
        const reason = error instanceof Error ? error.message : 'unknown';
        return { status: 'error', reason };
      }
    },
  };
}
