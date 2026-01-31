import type { Logger } from 'pino';
import type { ReviewJob } from '../queue/reviewQueue.js';
import type { ReviewRequestTrackingGateway, Platform } from '../gateways/reviewRequestTracking.gateway.js';

export interface TriggerReviewParams {
  platform: Platform;
  projectPath: string;
  localPath: string;
  reviewRequestNumber: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  mrUrl: string;
  skill: string;
  jobType?: 'review' | 'followup';
  assignedBy?: {
    username: string;
    displayName?: string;
  };
}

export type TriggerReviewResult =
  | { status: 'success'; jobId: string }
  | { status: 'deduplicated'; reason: string }
  | { status: 'failed'; reason: string };

export interface ReviewQueuePort {
  hasActiveJob(jobId: string): boolean;
  enqueue(job: ReviewJob): boolean;
  createJobId(platform: string, projectPath: string, mrNumber: number): string;
}

export interface TriggerReviewDependencies {
  queuePort: ReviewQueuePort;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
}

export function triggerReview(
  params: TriggerReviewParams,
  deps: TriggerReviewDependencies
): TriggerReviewResult {
  const { queuePort, reviewRequestTrackingGateway, logger } = deps;

  const jobIdPrefix = params.jobType === 'followup'
    ? `${params.platform}-followup`
    : params.platform;
  const jobId = queuePort.createJobId(jobIdPrefix, params.projectPath, params.reviewRequestNumber);

  if (queuePort.hasActiveJob(jobId)) {
    logger.info({ jobId }, 'Review already in progress, deduplicating');
    return { status: 'deduplicated', reason: 'Review already in progress' };
  }

  const job: ReviewJob = {
    id: jobId,
    platform: params.platform,
    projectPath: params.projectPath,
    localPath: params.localPath,
    mrNumber: params.reviewRequestNumber,
    skill: params.skill,
    mrUrl: params.mrUrl,
    sourceBranch: params.sourceBranch,
    targetBranch: params.targetBranch,
    jobType: params.jobType,
    title: params.title,
    assignedBy: params.assignedBy,
  };

  const enqueued = queuePort.enqueue(job);
  if (!enqueued) {
    logger.warn({ jobId }, 'Failed to enqueue job');
    return { status: 'failed', reason: 'Queue full or job rejected' };
  }

  reviewRequestTrackingGateway.recordPush(
    params.localPath,
    params.reviewRequestNumber,
    params.platform
  );

  logger.info(
    { jobId, reviewRequestNumber: params.reviewRequestNumber, jobType: params.jobType },
    'Review triggered'
  );

  return { status: 'success', jobId };
}
