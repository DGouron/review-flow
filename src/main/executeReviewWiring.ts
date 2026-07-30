import type { Logger } from 'pino';

import { invokeClaudeReview, sendNotification } from '@/claude/invoker.js';
import { findRepositoryByProjectPath } from '@/config/loader.js';
import type { ClaudeInvokerDependencies } from '@/frameworks/claude/claudeInvoker.js';
import { updateJobProgress } from '@/frameworks/queue/pQueueAdapter.js';
import { startWatchingReviewContext, stopWatchingReviewContext } from '@/main/websocket.js';
import type { DiffMetadataFetchGateway } from '@/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.js';
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import {
  resolvePinnedThreadFetchTarget,
  resolvePinnedThreads,
} from '@/modules/platform-integration/services/pinnedThreadFetchTarget.js';
import { resolveProvenance } from '@/modules/review-execution/entities/actionProvenance/actionProvenance.js';
import type {
  ClaudeReviewInvoker,
  ReviewProgressCallback,
} from '@/modules/review-execution/entities/review/claudeReviewInvoker.gateway.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import type {
  ThreadInventoryGateway,
  ThreadInventoryPage,
} from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { dispatchConstrainedActions } from '@/modules/review-execution/services/dispatchConstrainedActions.js';
import { defaultCommandExecutor } from '@/modules/review-execution/services/threadActionsExecutor.js';
import { parseThreadActions } from '@/modules/review-execution/services/threadActionsParser.js';
import {
  executeReview,
  type ExecuteReview,
  type ExecuteReviewDependencies,
  type ResolveThreadsInput,
} from '@/modules/review-execution/usecases/executeReview.usecase.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { countSucceeded, emptyExecutionResult } from '@/shared/foundation/executionGateway.base.js';

const progressWatcher = {
  start: startWatchingReviewContext,
  stop: stopWatchingReviewContext,
};

function buildClaudeReviewInvoker(
  logger: Logger,
  claudeInvokerDeps: ClaudeInvokerDependencies | undefined,
): ClaudeReviewInvoker {
  return {
    async invoke(job, onProgress: ReviewProgressCallback, signal) {
      const result = await invokeClaudeReview(job, logger, onProgress, signal, claudeInvokerDeps);
      return {
        success: result.success,
        cancelled: result.cancelled,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
      };
    },
  };
}

function buildGitLabResolveThreads(
  threadFetchGateway: ThreadFetchGateway,
  logger: Logger,
): (input: ResolveThreadsInput) => ReviewContextThread[] {
  return ({ job, isFollowup }) => {
    if (isFollowup) {
      return resolvePinnedThreads({
        payloadProjectPath: job.projectPath,
        payloadMrNumber: job.mrNumber,
        findRepository: (projectPath) => {
          const matched = findRepositoryByProjectPath(projectPath);
          return matched ? { projectPath } : null;
        },
        gatedMrNumber: job.mrNumber,
        fetchThreads: (projectPath, mrNumber) =>
          threadFetchGateway.fetchThreads(projectPath, mrNumber),
        logger,
      });
    }

    const pinnedTarget = resolvePinnedThreadFetchTarget({
      payloadProjectPath: job.projectPath,
      payloadMrNumber: job.mrNumber,
      findRepository: (projectPath) => {
        const matched = findRepositoryByProjectPath(projectPath);
        return matched ? { projectPath } : null;
      },
      gatedMrNumber: job.mrNumber,
    });
    if (!pinnedTarget) {
      logger.warn(
        { projectPath: job.projectPath, mrNumber: job.mrNumber },
        'Thread-fetch target failed provenance pin; action surface is empty',
      );
      return [];
    }
    return threadFetchGateway.fetchThreads(pinnedTarget.projectPath, pinnedTarget.mrNumber);
  };
}

function buildPlainResolveThreads(
  threadFetchGateway: ThreadFetchGateway,
): (input: ResolveThreadsInput) => ReviewContextThread[] {
  return ({ job }) => threadFetchGateway.fetchThreads(job.projectPath, job.mrNumber);
}

/**
 * Authenticated GitHub thread inventory derived from the same gateway used to
 * pre-fetch the review context. A single complete page is sufficient: the
 * constrained-dispatch chokepoint only needs the authenticated id set, never the
 * webhook payload.
 */
function buildGitHubInventoryGateway(
  threadFetchGateway: ThreadFetchGateway,
): ThreadInventoryGateway {
  return {
    fetchPage(projectPath: string, mergeRequestNumber: number): ThreadInventoryPage {
      const threads = threadFetchGateway.fetchThreads(projectPath, mergeRequestNumber);
      return { page: 1, totalPages: 1, threadIds: threads.map((thread) => thread.id) };
    },
  };
}

export interface ExecuteReviewWiringDependencies {
  platform: Platform;
  logger: Logger;
  reviewContextGateway: ReviewContextGateway;
  threadFetchGateway: ThreadFetchGateway;
  diffMetadataFetchGateway: DiffMetadataFetchGateway;
  diffStatsFetchGateway: DiffStatsFetchGateway;
  noteCommentPostGateway: NoteCommentPostGateway;
  inventoryGateway: ThreadInventoryGateway;
  recordCompletion: RecordReviewCompletionUseCase;
  syncThreads: SyncThreadsUseCase;
  claudeInvokerDeps?: ClaudeInvokerDependencies;
}

export function buildExecuteReview(wiring: ExecuteReviewWiringDependencies): ExecuteReview {
  const {
    platform,
    logger,
    reviewContextGateway,
    threadFetchGateway,
    diffMetadataFetchGateway,
    diffStatsFetchGateway,
    noteCommentPostGateway,
    inventoryGateway,
    recordCompletion,
    syncThreads,
    claudeInvokerDeps,
  } = wiring;

  const resolveThreads =
    platform === 'gitlab'
      ? buildGitLabResolveThreads(threadFetchGateway, logger)
      : buildPlainResolveThreads(threadFetchGateway);

  const deps: ExecuteReviewDependencies = {
    reviewContextGateway,
    diffStatsFetchGateway,
    recordCompletion,
    syncThreads,
    claudeInvoker: buildClaudeReviewInvoker(logger, claudeInvokerDeps),
    progressWatcher,
    updateJobProgress,
    sendNotification: (title, message) => sendNotification(title, message, logger),
    resolveThreads,
    executeContextActions: async ({ context, localPath, baseUrl }) => {
      const result = await executeActionsFromContext(
        context,
        localPath,
        logger,
        defaultCommandExecutor,
        baseUrl,
        noteCommentPostGateway,
      );
      return { result, threadsClosed: countSucceeded(result, 'THREAD_RESOLVE') };
    },
    executeFallbackActions: async ({ stdout, job }) => {
      const threadActions = parseThreadActions(stdout);
      if (threadActions.length === 0) {
        return { result: emptyExecutionResult(), threadsClosed: 0 };
      }
      const result = await dispatchConstrainedActions(threadActions, {
        context: {
          platform,
          projectPath: job.projectPath,
          mrNumber: job.mrNumber,
          localPath: job.localPath,
        },
        provenance: resolveProvenance(null),
        inventoryGateway,
        logger,
        executor: defaultCommandExecutor,
        postGateway: noteCommentPostGateway,
      });
      return { result, threadsClosed: countSucceeded(result, 'THREAD_RESOLVE') };
    },
    fetchDiffMetadata: (projectPath, mergeRequestNumber) =>
      diffMetadataFetchGateway.fetchDiffMetadata(projectPath, mergeRequestNumber),
    logger,
  };

  return (input) => executeReview(input, deps);
}

export { buildGitHubInventoryGateway };
