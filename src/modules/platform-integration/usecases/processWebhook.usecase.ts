import type { Logger } from 'pino';

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import type { HandleClose } from '@/modules/review-execution/usecases/handleClose.usecase.js';
import type { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import type { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import type { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type { RemoveWorktreeAction } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export type ProcessWebhookResult =
  | { type: 'closed'; mergeRequestNumber: number; jobCancelled: boolean; trackingArchived: boolean }
  | { type: 'merged'; mergeRequestNumber: number }
  | { type: 'followup-eligible'; mergeRequestNumber: number }
  | { type: 'followup-skipped'; mergeRequestNumber: number; reason: string }
  | { type: 'ignored'; reason: string };

export interface ProcessWebhookDependencies {
  handleClose: HandleClose;
  transitionState: Pick<TransitionStateUseCase, 'execute'>;
  recordPush: Pick<RecordPushUseCase, 'execute'>;
  checkFollowupNeeded: Pick<CheckFollowupNeededUseCase, 'execute'>;
  removeWorktree: RemoveWorktreeAction;
  logger: Logger;
}

export type ProcessWebhook = (event: WebhookEvent) => Promise<ProcessWebhookResult>;

type CloseEvent = Extract<WebhookEvent, { type: 'close' }>;
type MergeEvent = Extract<WebhookEvent, { type: 'merge' }>;
type FollowupEvent = Extract<WebhookEvent, { type: 'followup-push' }>;

function buildMergeRequestId(event: {
  platform: string;
  projectPath: string;
  mergeRequestNumber: number;
}): string {
  return `${event.platform}-${event.projectPath}-${event.mergeRequestNumber}`;
}

async function routeClose(
  event: CloseEvent,
  deps: ProcessWebhookDependencies,
): Promise<ProcessWebhookResult> {
  const cleanup = await deps.handleClose({
    platform: event.platform,
    projectPath: event.projectPath,
    localPath: event.localPath,
    mergeRequestNumber: event.mergeRequestNumber,
  });
  return {
    type: 'closed',
    mergeRequestNumber: event.mergeRequestNumber,
    jobCancelled: cleanup.jobCancelled,
    trackingArchived: cleanup.trackingArchived,
  };
}

async function removeWorktreeBestEffort(
  event: MergeEvent,
  deps: ProcessWebhookDependencies,
): Promise<void> {
  try {
    const removal = await deps.removeWorktree({
      identity: {
        platform: event.platform,
        projectPath: event.projectPath,
        mrNumber: event.mergeRequestNumber,
      },
      sourceCheckoutPath: event.localPath,
    });
    if (removal.status === 'failed') {
      deps.logger.warn(
        { mergeRequestNumber: event.mergeRequestNumber, warning: removal.warning },
        'removeWorktree failed on merge',
      );
    }
  } catch (error) {
    deps.logger.warn(
      {
        mergeRequestNumber: event.mergeRequestNumber,
        error: error instanceof Error ? error.message : String(error),
      },
      'removeWorktree threw on merge',
    );
  }
}

async function routeMerge(
  event: MergeEvent,
  deps: ProcessWebhookDependencies,
): Promise<ProcessWebhookResult> {
  deps.transitionState.execute({
    projectPath: event.localPath,
    mrId: buildMergeRequestId(event),
    targetState: 'merged',
  });
  await removeWorktreeBestEffort(event, deps);
  return { type: 'merged', mergeRequestNumber: event.mergeRequestNumber };
}

function decideFollowupSkipReason(
  event: FollowupEvent,
  deps: ProcessWebhookDependencies,
): string | null {
  const trackedMr = deps.recordPush.execute({
    projectPath: event.localPath,
    mrNumber: event.mergeRequestNumber,
    platform: event.platform,
  });
  if (!trackedMr) return 'Merge request not tracked';

  const needsFollowup = deps.checkFollowupNeeded.execute({
    projectPath: event.localPath,
    mrNumber: event.mergeRequestNumber,
    platform: event.platform,
  });
  if (!needsFollowup) return 'No followup needed';

  if (trackedMr.autoFollowup === false) return 'Auto-followup disabled';

  return null;
}

function routeFollowup(
  event: FollowupEvent,
  deps: ProcessWebhookDependencies,
): ProcessWebhookResult {
  const skipReason = decideFollowupSkipReason(event, deps);
  if (skipReason) {
    return {
      type: 'followup-skipped',
      mergeRequestNumber: event.mergeRequestNumber,
      reason: skipReason,
    };
  }

  return { type: 'followup-eligible', mergeRequestNumber: event.mergeRequestNumber };
}

export async function processWebhook(
  event: WebhookEvent,
  deps: ProcessWebhookDependencies,
): Promise<ProcessWebhookResult> {
  switch (event.type) {
    case 'close':
      return routeClose(event, deps);
    case 'merge':
      return routeMerge(event, deps);
    case 'followup-push':
      return routeFollowup(event, deps);
    case 'review-requested':
      return { type: 'ignored', reason: 'review-requested-handled-by-controller' };
    case 'approve':
      return { type: 'ignored', reason: 'approve-handled-by-controller' };
    case 'ignored':
      return { type: 'ignored', reason: event.reason };
  }
}
