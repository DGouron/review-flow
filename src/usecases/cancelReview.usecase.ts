import type { Logger } from 'pino';

export type CancelReviewResult =
  | { status: 'cancelled'; jobId: string }
  | { status: 'not-found'; jobId: string }
  | { status: 'already-completed'; jobId: string };

export interface CancelReviewQueuePort {
  getJobStatus(jobId: string): 'queued' | 'running' | 'completed' | 'failed' | null;
  cancelJob(jobId: string): boolean;
}

export interface CancelReviewDependencies {
  queuePort: CancelReviewQueuePort;
  logger: Logger;
}

export function cancelReview(
  jobId: string,
  deps: CancelReviewDependencies
): CancelReviewResult {
  const { queuePort, logger } = deps;

  const status = queuePort.getJobStatus(jobId);

  if (status === null) {
    logger.warn({ jobId }, 'Job not found for cancellation');
    return { status: 'not-found', jobId };
  }

  if (status === 'completed' || status === 'failed') {
    logger.info({ jobId, status }, 'Job already completed, cannot cancel');
    return { status: 'already-completed', jobId };
  }

  const cancelled = queuePort.cancelJob(jobId);

  if (cancelled) {
    logger.info({ jobId }, 'Review cancelled');
    return { status: 'cancelled', jobId };
  }

  return { status: 'not-found', jobId };
}
