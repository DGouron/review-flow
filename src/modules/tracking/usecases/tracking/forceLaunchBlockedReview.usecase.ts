import type { Logger } from 'pino';

import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';

type ReviewProcessor = (job: ReviewJob, signal: AbortSignal) => Promise<void>;

interface ForceLaunchBlockedReviewInput {
  projectPath: string;
  mrId: string;
  job: ReviewJob;
  processor: ReviewProcessor;
}

export type ForceLaunchBlockedReviewResult =
  | 'launched'
  | 'rejected-duplicate'
  | 'not-blocked'
  | 'mr-not-found';

interface ForceLaunchBlockedReviewDependencies {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  enqueue: (job: ReviewJob, processor: ReviewProcessor) => Promise<boolean>;
  logger: Logger;
}

export class ForceLaunchBlockedReviewUseCase {
  constructor(private readonly dependencies: ForceLaunchBlockedReviewDependencies) {}

  async execute(input: ForceLaunchBlockedReviewInput): Promise<ForceLaunchBlockedReviewResult> {
    const { reviewRequestTrackingGateway, enqueue, logger } = this.dependencies;

    const mr = reviewRequestTrackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return 'mr-not-found';
    if (mr.sizeBlock === null) return 'not-blocked';

    const enqueued = await enqueue(input.job, input.processor);
    if (!enqueued) return 'rejected-duplicate';

    reviewRequestTrackingGateway.update(input.projectPath, input.mrId, { sizeBlock: null });
    logger.info({ mrId: input.mrId }, 'Oversized MR force-launched, size block cleared');

    return 'launched';
  }
}
