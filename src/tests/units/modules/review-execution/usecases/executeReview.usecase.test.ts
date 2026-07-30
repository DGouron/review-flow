import { describe, it, expect, beforeEach } from 'vitest';

import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import {
  executeReview,
  type ExecuteReviewDependencies,
  type ExecuteReviewInput,
} from '@/modules/review-execution/usecases/executeReview.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { ReviewJobFactory } from '@/tests/factories/reviewJob.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { ClaudeReviewInvokerStub } from '@/tests/stubs/claudeReviewInvoker.stub.js';
import { StubDiffMetadataFetchGateway } from '@/tests/stubs/diffMetadataFetch.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { ProgressWatcherStub } from '@/tests/stubs/progressWatcher.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const SUCCESS_STDOUT = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';

interface Harness {
  deps: ExecuteReviewDependencies;
  contextGateway: StubReviewContextGateway;
  claudeInvoker: ClaudeReviewInvokerStub;
  diffMetadata: StubDiffMetadataFetchGateway;
  progressWatcher: ProgressWatcherStub;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
  notifications: Array<{ title: string; message: string }>;
  contextActionCalls: number;
  fallbackActionCalls: number;
  setFallbackThreadsClosed: (count: number) => void;
  setContextThreadsClosed: (count: number) => void;
  resolvedThreads: ReviewContextThread[];
  setResolveThreadsError: (error: Error) => void;
}

function createHarness(): Harness {
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
  const diffMetadata = new StubDiffMetadataFetchGateway();
  const progressWatcher = new ProgressWatcherStub();
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const notifications: Array<{ title: string; message: string }> = [];

  const state = {
    contextActionCalls: 0,
    fallbackActionCalls: 0,
    fallbackThreadsClosed: 0,
    contextThreadsClosed: 1,
    resolvedThreads: [] as ReviewContextThread[],
    resolveThreadsError: null as Error | null,
  };

  const deps: ExecuteReviewDependencies = {
    reviewContextGateway: contextGateway,
    diffStatsFetchGateway: { fetchDiffStats: () => null },
    recordCompletion: new RecordReviewCompletionUseCase(trackingGateway),
    syncThreads: { execute: () => null },
    claudeInvoker,
    progressWatcher,
    updateJobProgress: () => {},
    sendNotification: (title, message) => {
      notifications.push({ title, message });
    },
    resolveThreads: () => {
      if (state.resolveThreadsError) {
        throw state.resolveThreadsError;
      }
      return state.resolvedThreads;
    },
    executeContextActions: async () => {
      state.contextActionCalls += 1;
      return {
        result: { total: 1, succeeded: 1, failed: 0, skipped: 0 },
        threadsClosed: state.contextThreadsClosed,
      };
    },
    executeFallbackActions: async () => {
      state.fallbackActionCalls += 1;
      return {
        result: { total: 1, succeeded: 1, failed: 0, skipped: 0 },
        threadsClosed: state.fallbackThreadsClosed,
      };
    },
    fetchDiffMetadata: (projectPath, mrNumber) =>
      diffMetadata.fetchDiffMetadata(projectPath, mrNumber),
    logger: createStubLogger(),
  };

  return {
    deps,
    contextGateway,
    claudeInvoker,
    diffMetadata,
    progressWatcher,
    trackingGateway,
    notifications,
    get contextActionCalls() {
      return state.contextActionCalls;
    },
    get fallbackActionCalls() {
      return state.fallbackActionCalls;
    },
    setFallbackThreadsClosed: (count) => {
      state.fallbackThreadsClosed = count;
    },
    setContextThreadsClosed: (count) => {
      state.contextThreadsClosed = count;
    },
    get resolvedThreads() {
      return state.resolvedThreads;
    },
    setResolveThreadsError: (error) => {
      state.resolveThreadsError = error;
    },
  };
}

function reviewInput(overrides?: Partial<ExecuteReviewInput>): ExecuteReviewInput {
  return {
    job: ReviewJobFactory.create({ jobType: 'review' }),
    signal: new AbortController().signal,
    platform: 'gitlab',
    isFollowup: false,
    agents: [],
    baseUrl: 'https://gitlab.com',
    notificationPrefix: 'MR !',
    qualityThreshold: null,
    ...overrides,
  };
}

function seedTrackedMr(harness: Harness, mergeRequestId: string): void {
  harness.trackingGateway.create(
    '/tmp/repos/test-project',
    TrackedMrFactory.create({
      id: mergeRequestId,
      mrNumber: 42,
      project: 'test-org/test-project',
      platform: 'gitlab',
      state: 'pending-fix',
      openThreads: 2,
      totalThreads: 2,
    }),
  );
}

function appendContextActionsDuringInvoke(
  harness: Harness,
  mergeRequestId: string,
  actionThreadIds: string[],
): void {
  harness.claudeInvoker.onInvoke((job) => {
    for (const threadId of actionThreadIds) {
      harness.contextGateway.appendAction(job.localPath, mergeRequestId, {
        type: 'THREAD_RESOLVE',
        threadId,
      });
    }
  });
}

/** Reproduces a worktree cleaned up while Claude was running: the context file vanishes. */
function dropContextDuringInvoke(harness: Harness, mergeRequestId: string): void {
  harness.claudeInvoker.onInvoke((job) => {
    harness.contextGateway.delete(job.localPath, mergeRequestId);
  });
}

describe('executeReview', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  describe('review success', () => {
    it('completes, runs context actions as primary, and records stats', async () => {
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      appendContextActionsDuringInvoke(harness, mergeRequestId, ['t-1']);

      const result = await executeReview(reviewInput({ job }), harness.deps);

      expect(result.status).toBe('completed');
      expect(harness.contextActionCalls).toBe(1);
      expect(harness.fallbackActionCalls).toBe(0);
      const stored = harness.trackingGateway.getById('/tmp/repos/test-project', mergeRequestId);
      expect(stored?.reviews.length).toBe(1);
    });

    it('notifies start and completion with the merge-request prefix', async () => {
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      appendContextActionsDuringInvoke(harness, mergeRequestId, ['t-1']);

      await executeReview(reviewInput({ job }), harness.deps);

      expect(harness.notifications[0].title).toBe('Review démarrée');
      expect(harness.notifications.at(-1)?.title).toBe('Review terminée');
      expect(harness.notifications[0].message).toContain('MR !42');
    });
  });

  describe('fallback to stdout markers', () => {
    it('runs the fallback executor (not context) when there are no context actions', async () => {
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);

      const result = await executeReview(reviewInput({ job }), harness.deps);

      expect(result.status).toBe('completed');
      expect(harness.contextActionCalls).toBe(0);
      expect(harness.fallbackActionCalls).toBe(1);
    });
  });

  describe('followup success', () => {
    it('syncs threads and reports the closed-thread count', async () => {
      let syncCalled = false;
      harness.deps.syncThreads = {
        execute: () => {
          syncCalled = true;
          return null;
        },
      };
      harness.setContextThreadsClosed(3);
      const job = ReviewJobFactory.createFollowup();
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      appendContextActionsDuringInvoke(harness, mergeRequestId, ['t-1', 't-2', 't-3']);

      const result = await executeReview(reviewInput({ job, isFollowup: true }), harness.deps);

      expect(result.status).toBe('completed');
      expect(syncCalled).toBe(true);
      if (result.status === 'completed') {
        expect(result.stats.threadsClosed).toBe(3);
      }
    });
  });

  describe('cancelled review', () => {
    it('notifies cancellation and records no stats', async () => {
      harness.claudeInvoker.setResult({
        success: false,
        cancelled: true,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);

      const result = await executeReview(reviewInput({ job }), harness.deps);

      expect(result.status).toBe('cancelled');
      expect(harness.notifications.at(-1)?.title).toBe('Review annulée');
      const stored = harness.trackingGateway.getById('/tmp/repos/test-project', mergeRequestId);
      expect(stored?.reviews.length ?? 0).toBe(0);
    });
  });

  describe('failed review', () => {
    it('returns failed with the stderr reason and notifies failure', async () => {
      harness.claudeInvoker.setResult({
        success: false,
        cancelled: false,
        exitCode: 2,
        stdout: '',
        stderr: 'exploded',
        durationMs: 500,
      });
      const job = ReviewJobFactory.create({ jobType: 'review' });

      const result = await executeReview(reviewInput({ job }), harness.deps);

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toBe('exploded');
      }
      expect(harness.notifications.at(-1)?.title).toBe('Review échouée');
    });
  });

  describe('unreadable review context', () => {
    it('returns failed when the context file is gone after Claude ran', async () => {
      const job = ReviewJobFactory.create({ jobType: 'followup' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      dropContextDuringInvoke(harness, mergeRequestId);

      const result = await executeReview(reviewInput({ job, isFollowup: true }), harness.deps);

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toContain('review context');
      }
    });

    it('notifies failure instead of completion', async () => {
      const job = ReviewJobFactory.create({ jobType: 'followup' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      dropContextDuringInvoke(harness, mergeRequestId);

      await executeReview(reviewInput({ job, isFollowup: true }), harness.deps);

      expect(harness.notifications.at(-1)?.title).toBe('Review followup échouée');
    });

    it('never silently falls back to stdout markers and records no stats', async () => {
      const job = ReviewJobFactory.create({ jobType: 'followup' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      dropContextDuringInvoke(harness, mergeRequestId);

      await executeReview(reviewInput({ job, isFollowup: true }), harness.deps);

      expect(harness.contextActionCalls).toBe(0);
      expect(harness.fallbackActionCalls).toBe(0);
      const stored = harness.trackingGateway.getById('/tmp/repos/test-project', mergeRequestId);
      expect(stored?.reviews.length ?? 0).toBe(0);
    });
  });

  describe('best-effort context creation', () => {
    it('still invokes Claude when thread resolution fails, then reports the lost context', async () => {
      harness.setResolveThreadsError(new Error('thread fetch boom'));
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);

      const result = await executeReview(reviewInput({ job }), harness.deps);

      expect(harness.claudeInvoker.invocations).toHaveLength(1);
      // No context file was ever written, so nothing Claude asked for could be published.
      expect(result.status).toBe('failed');
    });

    it('still invokes Claude when diff metadata fetch fails', async () => {
      harness.diffMetadata.failWith(new Error('diff boom'));
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      appendContextActionsDuringInvoke(harness, mergeRequestId, ['t-1']);

      const result = await executeReview(reviewInput({ job }), harness.deps);

      expect(result.status).toBe('completed');
      expect(harness.claudeInvoker.invocations).toHaveLength(1);
    });
  });

  describe('progress watcher lifecycle', () => {
    it('starts before invoking Claude and stops afterwards', async () => {
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      seedTrackedMr(harness, mergeRequestId);
      appendContextActionsDuringInvoke(harness, mergeRequestId, ['t-1']);

      await executeReview(reviewInput({ job }), harness.deps);

      expect(harness.progressWatcher.started).toHaveLength(1);
      expect(harness.progressWatcher.stopped).toContain(mergeRequestId);
    });
  });
});
