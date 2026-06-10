import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

const DEFAULT_GRACE_WINDOW_MS = 30 * 60 * 1000;

export function shouldRecover(context: ReviewContext): boolean {
  return context.progress.phase === 'completed' && context.actions.length > 0 && !context.result;
}

export interface RecoveryLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface RecoveryRepository {
  localPath: string;
}

export interface RecoverySummary {
  scanned: number;
  recovered: number;
  partial: number;
  backfilled: number;
  skipped: number;
  failed: number;
}

export interface ExecuteActionsOutcome {
  posted: number;
  failed: number;
}

export interface RecoveryDeps {
  repositories: RecoveryRepository[];
  reviewContextGateway: ReviewContextGateway;
  executeActions: (context: ReviewContext, localPath: string) => Promise<ExecuteActionsOutcome>;
  now: () => number;
  logger: RecoveryLogger;
  graceWindowMs?: number;
}

export async function runReviewRecovery(deps: RecoveryDeps): Promise<RecoverySummary> {
  const graceWindowMs = deps.graceWindowMs ?? DEFAULT_GRACE_WINDOW_MS;
  const summary: RecoverySummary = {
    scanned: 0,
    recovered: 0,
    partial: 0,
    backfilled: 0,
    skipped: 0,
    failed: 0,
  };

  for (const repository of deps.repositories) {
    for (const context of deps.reviewContextGateway.listAll(repository.localPath)) {
      summary.scanned += 1;

      if (!shouldRecover(context)) {
        summary.skipped += 1;
        continue;
      }

      const lastActivityMs = lastActivityTime(context);
      const ageMs = deps.now() - lastActivityMs;
      const isStale = ageMs > graceWindowMs;

      if (isStale) {
        markBackfilled(
          deps.reviewContextGateway,
          repository.localPath,
          context,
          'stale-on-boot',
          deps.now,
        );
        deps.logger.info(
          { mergeRequestId: context.mergeRequestId, ageMs },
          'Review context backfilled (older than grace window, not replayed)',
        );
        summary.backfilled += 1;
        continue;
      }

      try {
        const outcome = await deps.executeActions(context, repository.localPath);
        if (outcome.posted === 0) {
          // Nothing reached the platform — safe to retry on the next boot, so do
          // not finalize the context.
          summary.failed += 1;
          deps.logger.warn(
            { mergeRequestId: context.mergeRequestId, outcome },
            'Recovery posted zero actions, leaving context for retry',
          );
          continue;
        }
        // At least one action was posted. Finalize the context regardless of
        // partial failures — re-running would double-post the successes.
        markBackfilled(
          deps.reviewContextGateway,
          repository.localPath,
          context,
          'recovered-after-restart',
          deps.now,
        );
        if (outcome.failed > 0) {
          summary.partial += 1;
          deps.logger.warn(
            { mergeRequestId: context.mergeRequestId, outcome },
            'Recovery completed with partial failures — context finalized to avoid double-post',
          );
        } else {
          summary.recovered += 1;
          deps.logger.info(
            { mergeRequestId: context.mergeRequestId, posted: outcome.posted },
            'Review context recovered after restart',
          );
        }
      } catch (error) {
        summary.failed += 1;
        deps.logger.error(
          {
            mergeRequestId: context.mergeRequestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Recovery execution threw',
        );
      }
    }
  }

  return summary;
}

function lastActivityTime(context: ReviewContext): number {
  const updatedAt = context.progress.updatedAt;
  if (updatedAt) {
    const parsed = new Date(updatedAt).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return new Date(context.createdAt).getTime();
}

function markBackfilled(
  gateway: ReviewContextGateway,
  localPath: string,
  context: ReviewContext,
  reason: 'stale-on-boot' | 'recovered-after-restart',
  now: () => number,
): void {
  gateway.setResult(localPath, context.mergeRequestId, {
    kind: 'backfilled',
    backfilledAt: new Date(now()).toISOString(),
    reason,
  });
}
