import { describe, it, expect } from 'vitest';

import { ClearReviewInProgressUseCase } from '@/modules/platform-integration/usecases/clearReviewInProgress.usecase.js';
import { MarkReviewInProgressUseCase } from '@/modules/platform-integration/usecases/markReviewInProgress.usecase.js';
import {
  executeReview,
  type ExecuteReviewDependencies,
} from '@/modules/review-execution/usecases/executeReview.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { emptyExecutionResult } from '@/shared/foundation/executionGateway.base.js';
import { ReviewJobFactory } from '@/tests/factories/reviewJob.factory.js';
import { ClaudeReviewInvokerStub } from '@/tests/stubs/claudeReviewInvoker.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { ProgressWatcherStub } from '@/tests/stubs/progressWatcher.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { StubReviewLabelGateway } from '@/tests/stubs/reviewLabel.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const SUCCESS_STDOUT = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';

function buildDependencies(overrides?: Partial<ExecuteReviewDependencies>): {
  deps: ExecuteReviewDependencies;
  contextGateway: StubReviewContextGateway;
  claudeInvoker: ClaudeReviewInvokerStub;
  contextActionCalls: number[];
  fallbackActionCalls: number[];
} {
  const contextGateway = new StubReviewContextGateway();
  const claudeInvoker = new ClaudeReviewInvokerStub();
  claudeInvoker.setResult({
    success: true,
    cancelled: false,
    exitCode: 0,
    stdout: SUCCESS_STDOUT,
    stderr: '',
    durationMs: 1000,
  });
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const reviewLabelGateway = new StubReviewLabelGateway();
  const logger = createStubLogger();
  const contextActionCalls: number[] = [];
  const fallbackActionCalls: number[] = [];

  const deps: ExecuteReviewDependencies = {
    reviewContextGateway: contextGateway,
    diffStatsFetchGateway: { fetchDiffStats: () => null },
    recordCompletion: new RecordReviewCompletionUseCase(trackingGateway),
    syncThreads: { execute: () => null },
    claudeInvoker,
    progressWatcher: new ProgressWatcherStub(),
    updateJobProgress: () => {},
    sendNotification: () => {},
    resolveThreads: () => [],
    executeContextActions: async ({ context }) => {
      contextActionCalls.push(Date.now());
      const threadsClosed = context.actions.filter(
        (action) => action.type === 'THREAD_RESOLVE',
      ).length;
      return {
        result: {
          total: 1,
          succeeded: 1,
          failed: 0,
          skipped: 0,
          outcomes: [{ type: 'THREAD_RESOLVE', status: 'succeeded' }],
        },
        threadsClosed,
      };
    },
    executeFallbackActions: async () => {
      fallbackActionCalls.push(Date.now());
      return { result: emptyExecutionResult(), threadsClosed: 0 };
    },
    fetchDiffMetadata: () => ({ baseSha: 'a', headSha: 'b', startSha: 'c' }),
    markReviewInProgress: new MarkReviewInProgressUseCase({ reviewLabelGateway, logger }),
    clearReviewInProgress: new ClearReviewInProgressUseCase({ reviewLabelGateway, logger }),
    logger,
    ...overrides,
  };

  return { deps, contextGateway, claudeInvoker, contextActionCalls, fallbackActionCalls };
}

function appendActionsDuringInvoke(
  contextGateway: StubReviewContextGateway,
  claudeInvoker: ClaudeReviewInvokerStub,
  mergeRequestId: string,
  threadIds: string[],
): void {
  claudeInvoker.onInvoke((job) => {
    for (const threadId of threadIds) {
      contextGateway.appendAction(job.localPath, mergeRequestId, {
        type: 'THREAD_RESOLVE',
        threadId,
      });
    }
  });
}

describe('SPEC-073 Stage 1 — executeReview (acceptance)', () => {
  describe('one shared executeReview use case drives every processor path', () => {
    it('gitlab review: completes, records stats, runs context actions as primary', async () => {
      const { deps, contextGateway, claudeInvoker, contextActionCalls } = buildDependencies();
      const job = ReviewJobFactory.create({ jobType: 'review' });
      appendActionsDuringInvoke(
        contextGateway,
        claudeInvoker,
        `gitlab-${job.projectPath}-${job.mrNumber}`,
        ['t-1'],
      );

      const result = await executeReview(
        {
          job,
          signal: new AbortController().signal,
          platform: 'gitlab',
          isFollowup: false,
          agents: [],
          baseUrl: 'https://gitlab.com',
          notificationPrefix: 'MR !',
          qualityThreshold: null,
        },
        deps,
      );

      expect(result.status).toBe('completed');
      expect(contextActionCalls).toHaveLength(1);
    });

    it('gitlab followup: completes, syncs threads, counts closed threads', async () => {
      let syncCalled = false;
      const { deps, contextGateway, claudeInvoker } = buildDependencies({
        syncThreads: {
          execute: () => {
            syncCalled = true;
            return null;
          },
        },
      });
      const job = ReviewJobFactory.createFollowup();
      appendActionsDuringInvoke(
        contextGateway,
        claudeInvoker,
        `gitlab-${job.projectPath}-${job.mrNumber}`,
        ['t-1', 't-2'],
      );

      const result = await executeReview(
        {
          job,
          signal: new AbortController().signal,
          platform: 'gitlab',
          isFollowup: true,
          agents: [],
          baseUrl: 'https://gitlab.com',
          notificationPrefix: 'MR !',
          qualityThreshold: null,
        },
        deps,
      );

      expect(result.status).toBe('completed');
      expect(syncCalled).toBe(true);
      if (result.status === 'completed') {
        expect(result.stats.threadsClosed).toBe(2);
      }
    });
  });

  describe('GitHub review uses primary/fallback once (regression for dual execution bug)', () => {
    it('runs only context actions when context actions exist (not the fallback too)', async () => {
      const { deps, contextGateway, claudeInvoker, contextActionCalls, fallbackActionCalls } =
        buildDependencies();
      const job = ReviewJobFactory.createGitHub({ jobType: 'review' });
      appendActionsDuringInvoke(
        contextGateway,
        claudeInvoker,
        `github-${job.projectPath}-${job.mrNumber}`,
        ['t-1'],
      );

      await executeReview(
        {
          job,
          signal: new AbortController().signal,
          platform: 'github',
          isFollowup: false,
          agents: [],
          baseUrl: null,
          notificationPrefix: 'PR #',
          qualityThreshold: null,
        },
        deps,
      );

      expect(contextActionCalls).toHaveLength(1);
      expect(fallbackActionCalls).toHaveLength(0);
    });

    it('falls back to stdout markers only when there are no context actions', async () => {
      const { deps, claudeInvoker, contextActionCalls, fallbackActionCalls } = buildDependencies();
      claudeInvoker.setResult({
        success: true,
        cancelled: false,
        exitCode: 0,
        stdout: `${SUCCESS_STDOUT}\n[THREAD_RESOLVE:t-9]`,
        stderr: '',
        durationMs: 1000,
      });
      const job = ReviewJobFactory.createGitHub({ jobType: 'review' });

      await executeReview(
        {
          job,
          signal: new AbortController().signal,
          platform: 'github',
          isFollowup: false,
          agents: [],
          baseUrl: null,
          notificationPrefix: 'PR #',
          qualityThreshold: null,
        },
        deps,
      );

      expect(contextActionCalls).toHaveLength(0);
      expect(fallbackActionCalls).toHaveLength(1);
    });
  });

  describe('review failure returns failed so the caller throws for queue retry', () => {
    it('returns failed when the invocation fails and is not cancelled', async () => {
      const { deps, claudeInvoker } = buildDependencies();
      claudeInvoker.setResult({
        success: false,
        cancelled: false,
        exitCode: 1,
        stdout: '',
        stderr: 'boom',
        durationMs: 500,
      });
      const job = ReviewJobFactory.create({ jobType: 'review' });

      const result = await executeReview(
        {
          job,
          signal: new AbortController().signal,
          platform: 'gitlab',
          isFollowup: false,
          agents: [],
          baseUrl: null,
          notificationPrefix: 'MR !',
          qualityThreshold: null,
        },
        deps,
      );

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toBe('boom');
      }
    });

    it('returns cancelled without recording stats when the invocation is cancelled', async () => {
      const { deps, claudeInvoker } = buildDependencies();
      claudeInvoker.setResult({
        success: false,
        cancelled: true,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });
      const job = ReviewJobFactory.create({ jobType: 'review' });

      const result = await executeReview(
        {
          job,
          signal: new AbortController().signal,
          platform: 'gitlab',
          isFollowup: false,
          agents: [],
          baseUrl: null,
          notificationPrefix: 'MR !',
          qualityThreshold: null,
        },
        deps,
      );

      expect(result.status).toBe('cancelled');
    });
  });
});
