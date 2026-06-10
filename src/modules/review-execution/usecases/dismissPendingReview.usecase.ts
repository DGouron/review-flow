import type { Logger } from 'pino';

import type { PendingReviewRequestGateway } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.js';

export interface DismissQueuePort {
  hasActiveJob(jobId: string): boolean;
}

export interface DismissPendingReviewDependencies {
  pendingReviewRequestGateway: PendingReviewRequestGateway;
  queuePort: DismissQueuePort;
  logger: Logger;
}

export type DismissPendingReviewResult =
  | { status: 'dismissed' }
  | { status: 'not-found' }
  | { status: 'already-running'; message: string };

const ALREADY_RUNNING_DISMISS_MESSAGE = "Cette review est déjà en cours, impossible de l'ignorer";

export class DismissPendingReviewUseCase {
  constructor(private readonly deps: DismissPendingReviewDependencies) {}

  async execute(input: { pendingId: string }): Promise<DismissPendingReviewResult> {
    const { pendingReviewRequestGateway, queuePort, logger } = this.deps;

    const pending = await pendingReviewRequestGateway.load(input.pendingId);
    if (!pending) {
      return { status: 'not-found' };
    }

    if (queuePort.hasActiveJob(pending.job.id)) {
      logger.info(
        { pendingId: input.pendingId, jobId: pending.job.id },
        'Pending review dismiss rejected: already running',
      );
      return { status: 'already-running', message: ALREADY_RUNNING_DISMISS_MESSAGE };
    }

    await pendingReviewRequestGateway.delete(input.pendingId);
    logger.info({ pendingId: input.pendingId }, 'Pending review dismissed');
    return { status: 'dismissed' };
  }
}
