import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type { ExecutionResult } from '@/shared/foundation/executionGateway.base.js';

interface FailureLogger {
  error: (obj: object, msg: string) => void;
}

/**
 * A platform command that fails leaves no trace of its own — the gateway records the
 * outcome but writes nothing. Without this, a resolve rejected by the API is reported
 * exactly like one that landed.
 */
export function logExecutionFailures(result: ExecutionResult, logger: FailureLogger): void {
  for (const outcome of result.outcomes) {
    if (outcome.status === 'failed') {
      logger.error(
        { actionType: outcome.type, error: outcome.message },
        'Review action command failed',
      );
    }
  }
}

/**
 * Public-output actions bypass the CLI gateway for the scanned post sink, which either
 * delivers or throws. Fold them back in so the caller sees one outcome per action.
 */
export function mergeSinkedOutcomes(
  cliResult: ExecutionResult,
  sinkedActions: ReviewAction[],
): ExecutionResult {
  return {
    total: cliResult.total + sinkedActions.length,
    succeeded: cliResult.succeeded + sinkedActions.length,
    failed: cliResult.failed,
    skipped: cliResult.skipped,
    outcomes: [
      ...cliResult.outcomes,
      ...sinkedActions.map((action) => ({ type: action.type, status: 'succeeded' as const })),
    ],
  };
}
