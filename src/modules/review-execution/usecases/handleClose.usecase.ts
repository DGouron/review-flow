import type { Logger } from 'pino';

import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type {
  Platform,
  ReviewRequestTrackingGateway,
} from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { RemoveWorktreeAction } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface HandleCloseInput {
  platform: Platform;
  projectPath: string;
  localPath: string;
  mergeRequestNumber: number;
}

export interface HandleCloseResult {
  status: 'cleaned';
  jobCancelled: boolean;
  trackingArchived: boolean;
  contextDeleted: boolean;
}

export interface HandleCloseDependencies {
  trackingGateway: Pick<ReviewRequestTrackingGateway, 'archive'>;
  reviewContextGateway: Pick<ReviewContextGateway, 'delete'>;
  cancelJob: (jobId: string) => boolean;
  buildJobId: (platform: Platform, projectPath: string, mergeRequestNumber: number) => string;
  removeWorktree: RemoveWorktreeAction;
  logger: Logger;
}

export type HandleClose = (input: HandleCloseInput) => Promise<HandleCloseResult>;

function buildMergeRequestId(input: HandleCloseInput): string {
  return `${input.platform}-${input.projectPath}-${input.mergeRequestNumber}`;
}

async function removeWorktreeBestEffort(
  input: HandleCloseInput,
  deps: HandleCloseDependencies,
): Promise<void> {
  const { platform, projectPath, mergeRequestNumber, localPath } = input;
  try {
    const removal = await deps.removeWorktree({
      identity: { platform, projectPath, mrNumber: mergeRequestNumber },
      sourceCheckoutPath: localPath,
    });
    if (removal.status === 'failed') {
      deps.logger.warn(
        { platform, projectPath, mergeRequestNumber, warning: removal.warning },
        'removeWorktree failed on close',
      );
    }
  } catch (error) {
    deps.logger.warn(
      {
        platform,
        projectPath,
        mergeRequestNumber,
        error: error instanceof Error ? error.message : String(error),
      },
      'removeWorktree threw on close',
    );
  }
}

export async function handleClose(
  input: HandleCloseInput,
  deps: HandleCloseDependencies,
): Promise<HandleCloseResult> {
  const { platform, projectPath, localPath, mergeRequestNumber } = input;
  const mergeRequestId = buildMergeRequestId(input);

  const jobCancelled = deps.cancelJob(deps.buildJobId(platform, projectPath, mergeRequestNumber));
  const trackingArchived = deps.trackingGateway.archive(localPath, mergeRequestId);
  const contextDeleted = deps.reviewContextGateway.delete(localPath, mergeRequestId).deleted;

  await removeWorktreeBestEffort(input, deps);

  deps.logger.info(
    { platform, projectPath, mergeRequestNumber, jobCancelled, trackingArchived, contextDeleted },
    'Review request closed - cleaned up tracking, cancelled job, deleted context',
  );

  return { status: 'cleaned', jobCancelled, trackingArchived, contextDeleted };
}
