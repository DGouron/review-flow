import type { Logger } from 'pino';
import type { ReviewRequestTrackingGateway, Platform } from '../interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { ReviewQueuePort, TriggerReviewParams } from './triggerReview.usecase.js';
import { triggerReview } from './triggerReview.usecase.js';

export interface HandleReviewRequestPushParams {
  platform: Platform;
  projectPath: string;
  localPath: string;
  reviewRequestNumber: number;
  skill: string;
  mrUrl: string;
}

export type HandleReviewRequestPushResult =
  | { action: 'followup-triggered'; jobId: string }
  | { action: 'skipped'; reason: SkipReason };

export type SkipReason =
  | 'no-open-threads'
  | 'review-in-progress'
  | 'review-request-not-tracked'
  | 'not-pending-fix';

export interface HandleReviewRequestPushDependencies {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  queuePort: ReviewQueuePort;
  logger: Logger;
}

export function handleReviewRequestPush(
  params: HandleReviewRequestPushParams,
  deps: HandleReviewRequestPushDependencies
): HandleReviewRequestPushResult {
  const { reviewRequestTrackingGateway, queuePort, logger } = deps;

  const reviewRequest = reviewRequestTrackingGateway.getByNumber(
    params.localPath,
    params.reviewRequestNumber,
    params.platform
  );

  if (!reviewRequest) {
    logger.debug(
      { mrNumber: params.reviewRequestNumber },
      'Review request not tracked, skipping followup'
    );
    return { action: 'skipped', reason: 'review-request-not-tracked' };
  }

  if (reviewRequest.state !== 'pending-fix') {
    logger.debug(
      { mrNumber: params.reviewRequestNumber, state: reviewRequest.state },
      'Review request not in pending-fix state'
    );
    return { action: 'skipped', reason: 'not-pending-fix' };
  }

  if (reviewRequest.openThreads === 0) {
    logger.debug(
      { mrNumber: params.reviewRequestNumber },
      'No open threads, skipping followup'
    );
    return { action: 'skipped', reason: 'no-open-threads' };
  }

  const jobId = queuePort.createJobId(
    `${params.platform}-followup`,
    params.projectPath,
    params.reviewRequestNumber
  );

  if (queuePort.hasActiveJob(jobId)) {
    logger.debug({ jobId }, 'Review already in progress');
    return { action: 'skipped', reason: 'review-in-progress' };
  }

  const triggerParams: TriggerReviewParams = {
    platform: params.platform,
    projectPath: params.projectPath,
    localPath: params.localPath,
    reviewRequestNumber: params.reviewRequestNumber,
    title: reviewRequest.title,
    sourceBranch: reviewRequest.sourceBranch,
    targetBranch: reviewRequest.targetBranch,
    mrUrl: params.mrUrl,
    skill: params.skill,
    jobType: 'followup',
  };

  const result = triggerReview(triggerParams, {
    queuePort,
    reviewRequestTrackingGateway,
    logger,
  });

  if (result.status === 'success') {
    logger.info(
      { jobId: result.jobId, mrNumber: params.reviewRequestNumber },
      'Followup review triggered'
    );
    return { action: 'followup-triggered', jobId: result.jobId };
  }

  return { action: 'skipped', reason: 'review-in-progress' };
}
