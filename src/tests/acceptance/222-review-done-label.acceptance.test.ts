import { describe, it, expect } from 'vitest';

import {
  REVIEW_DONE_LABEL,
  REVIEW_IN_PROGRESS_LABEL,
} from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import { GitHubReviewLabelCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.github.cli.gateway.js';
import { GitLabReviewLabelCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.gitlab.cli.gateway.js';
import { ClearReviewInProgressUseCase } from '@/modules/platform-integration/usecases/clearReviewInProgress.usecase.js';
import { MarkReviewDoneUseCase } from '@/modules/platform-integration/usecases/markReviewDone.usecase.js';
import { MarkReviewInProgressUseCase } from '@/modules/platform-integration/usecases/markReviewInProgress.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import {
  executeReview,
  type ExecuteReviewDependencies,
  type ExecuteReviewInput,
} from '@/modules/review-execution/usecases/executeReview.usecase.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { emptyExecutionResult } from '@/shared/foundation/executionGateway.base.js';
import { ReviewJobFactory } from '@/tests/factories/reviewJob.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { ClaudeReviewInvokerStub } from '@/tests/stubs/claudeReviewInvoker.stub.js';
import { ProgressWatcherStub } from '@/tests/stubs/progressWatcher.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const SUCCESS_STDOUT = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';
const BLOCKING_STDOUT = '[REVIEW_STATS:blocking=3:warnings=0:suggestions=0:score=4]';

const GITHUB_ENSURE_DONE = `gh label create '${REVIEW_DONE_LABEL}' --force -R 'test-owner/test-repo'`;
const GITHUB_ADD_DONE = `gh api --method POST 'repos/test-owner/test-repo/issues/123/labels' --field 'labels[]=${REVIEW_DONE_LABEL}'`;
const GITHUB_REMOVE_DONE = `gh api --method DELETE 'repos/test-owner/test-repo/issues/123/labels/${REVIEW_DONE_LABEL}'`;
const GITHUB_ENSURE_IN_PROGRESS = `gh label create '${REVIEW_IN_PROGRESS_LABEL}' --force -R 'test-owner/test-repo'`;
const GITHUB_ADD_IN_PROGRESS = `gh api --method POST 'repos/test-owner/test-repo/issues/123/labels' --field 'labels[]=${REVIEW_IN_PROGRESS_LABEL}'`;
const GITHUB_REMOVE_IN_PROGRESS = `gh api --method DELETE 'repos/test-owner/test-repo/issues/123/labels/${REVIEW_IN_PROGRESS_LABEL}'`;

const GITLAB_ENSURE_DONE = `glab api --method POST 'projects/test-org%2Ftest-project/labels' --field 'name=${REVIEW_DONE_LABEL}' --field 'color=#1f77b4'`;
const GITLAB_ADD_DONE = `glab api --method PUT 'projects/test-org%2Ftest-project/merge_requests/42' --field 'add_labels=${REVIEW_DONE_LABEL}'`;
const GITLAB_REMOVE_DONE = `glab api --method PUT 'projects/test-org%2Ftest-project/merge_requests/42' --field 'remove_labels=${REVIEW_DONE_LABEL}'`;
const GITLAB_ENSURE_IN_PROGRESS = `glab api --method POST 'projects/test-org%2Ftest-project/labels' --field 'name=${REVIEW_IN_PROGRESS_LABEL}' --field 'color=#1f77b4'`;
const GITLAB_ADD_IN_PROGRESS = `glab api --method PUT 'projects/test-org%2Ftest-project/merge_requests/42' --field 'add_labels=${REVIEW_IN_PROGRESS_LABEL}'`;
const GITLAB_REMOVE_IN_PROGRESS = `glab api --method PUT 'projects/test-org%2Ftest-project/merge_requests/42' --field 'remove_labels=${REVIEW_IN_PROGRESS_LABEL}'`;

interface HarnessOptions {
  platform: Platform;
  failOn?: RegExp;
  duringInvoke?: (job: ReviewJob) => void;
}

interface Harness {
  deps: ExecuteReviewDependencies;
  commands: string[];
  commandsBeforeInvoke: string[];
  claudeInvoker: ClaudeReviewInvokerStub;
  contextGateway: StubReviewContextGateway;
  warnMessages: string[];
}

function createHarness(options: HarnessOptions): Harness {
  const commands: string[] = [];
  const commandsBeforeInvoke: string[] = [];
  const executor = (command: string): string => {
    commands.push(command);
    if (options.failOn?.test(command)) {
      throw new Error(`command failed: ${command}`);
    }
    return '';
  };

  const reviewLabelGateway =
    options.platform === 'github'
      ? new GitHubReviewLabelCliGateway(executor)
      : new GitLabReviewLabelCliGateway(executor);
  const { logger, warnMessages } = createCapturingLogger();
  const contextGateway = new StubReviewContextGateway();
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();

  const claudeInvoker = new ClaudeReviewInvokerStub();
  claudeInvoker.setResult({
    success: true,
    cancelled: false,
    exitCode: 0,
    stdout: SUCCESS_STDOUT,
    stderr: '',
    durationMs: 1000,
  });
  claudeInvoker.onInvoke((job) => {
    commandsBeforeInvoke.push(...commands);
    options.duringInvoke?.(job);
  });

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
    executeContextActions: async () => ({ result: emptyExecutionResult(), threadsClosed: 0 }),
    executeFallbackActions: async () => ({ result: emptyExecutionResult(), threadsClosed: 0 }),
    fetchDiffMetadata: () => ({ baseSha: 'a', headSha: 'b', startSha: 'c' }),
    markReviewInProgress: new MarkReviewInProgressUseCase({ reviewLabelGateway, logger }),
    clearReviewInProgress: new ClearReviewInProgressUseCase({ reviewLabelGateway, logger }),
    markReviewDone: new MarkReviewDoneUseCase({ reviewLabelGateway, logger }),
    logger,
  };

  return { deps, commands, commandsBeforeInvoke, claudeInvoker, contextGateway, warnMessages };
}

function gitLabInput(overrides?: Partial<ExecuteReviewInput>): ExecuteReviewInput {
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

function gitHubInput(overrides?: Partial<ExecuteReviewInput>): ExecuteReviewInput {
  return {
    ...gitLabInput(),
    job: ReviewJobFactory.createGitHub({ jobType: 'review' }),
    platform: 'github',
    baseUrl: null,
    notificationPrefix: 'PR #',
    ...overrides,
  };
}

describe('SPEC-222 review-done label (acceptance)', () => {
  describe('a completed review is labelled review-done', () => {
    it('initial review completes: ensures then applies review-done and removes review-in-progress', async () => {
      const harness = createHarness({ platform: 'gitlab' });

      const result = await executeReview(gitLabInput(), harness.deps);

      expect(harness.commands).toEqual([
        GITLAB_REMOVE_DONE,
        GITLAB_ENSURE_IN_PROGRESS,
        GITLAB_ADD_IN_PROGRESS,
        GITLAB_ENSURE_DONE,
        GITLAB_ADD_DONE,
        GITLAB_REMOVE_IN_PROGRESS,
      ]);
      expect(result).toEqual({
        status: 'completed',
        stats: {
          score: 7.5,
          blocking: 1,
          warnings: 2,
          suggestions: 3,
          threadsOpened: 1,
          threadsClosed: 0,
          durationMs: 1000,
        },
      });
    });

    /** Spec 224 gave the follow-up the full lifecycle; the done label still lands on it. */
    it('follow-up completes: applies review-done inside the in-progress lifecycle', async () => {
      const harness = createHarness({ platform: 'github' });
      const job = ReviewJobFactory.createGitHub({ jobType: 'followup' });

      const result = await executeReview(gitHubInput({ job, isFollowup: true }), harness.deps);

      expect(harness.commands).toEqual([
        GITHUB_REMOVE_DONE,
        GITHUB_ENSURE_IN_PROGRESS,
        GITHUB_ADD_IN_PROGRESS,
        GITHUB_ENSURE_DONE,
        GITHUB_ADD_DONE,
        GITHUB_REMOVE_IN_PROGRESS,
      ]);
      expect(result.status).toBe('completed');
    });

    it('blocking issues found: applies review-done all the same with unchanged stats', async () => {
      const harness = createHarness({ platform: 'gitlab' });
      harness.claudeInvoker.setResult({
        success: true,
        cancelled: false,
        exitCode: 0,
        stdout: BLOCKING_STDOUT,
        stderr: '',
        durationMs: 1000,
      });

      const result = await executeReview(gitLabInput(), harness.deps);

      expect(harness.commands).toContain(GITLAB_ADD_DONE);
      expect(result).toEqual({
        status: 'completed',
        stats: {
          score: 4,
          blocking: 3,
          warnings: 0,
          suggestions: 0,
          threadsOpened: 3,
          threadsClosed: 0,
          durationMs: 1000,
        },
      });
    });
  });

  describe('a run without a verdict applies nothing', () => {
    it('cancelled: no review-done applied, review-in-progress still removed', async () => {
      const harness = createHarness({ platform: 'gitlab' });
      harness.claudeInvoker.setResult({
        success: false,
        cancelled: true,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });

      const result = await executeReview(gitLabInput(), harness.deps);

      expect(harness.commands).not.toContain(GITLAB_ADD_DONE);
      expect(harness.commands.at(-1)).toBe(GITLAB_REMOVE_IN_PROGRESS);
      expect(result.status).toBe('cancelled');
    });

    it('failed on invocation: no review-done applied', async () => {
      const harness = createHarness({ platform: 'gitlab' });
      harness.claudeInvoker.setResult({
        success: false,
        cancelled: false,
        exitCode: 2,
        stdout: '',
        stderr: 'exploded',
        durationMs: 500,
      });

      const result = await executeReview(gitLabInput(), harness.deps);

      expect(harness.commands).not.toContain(GITLAB_ADD_DONE);
      expect(result).toEqual({ status: 'failed', reason: 'exploded' });
    });

    it('failed on unreadable context: no review-done applied', async () => {
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      const harness = createHarness({
        platform: 'gitlab',
        duringInvoke: () => {
          harness.contextGateway.delete(job.localPath, mergeRequestId);
        },
      });

      const result = await executeReview(gitLabInput({ job }), harness.deps);

      expect(harness.commands).not.toContain(GITLAB_ADD_DONE);
      expect(result.status).toBe('failed');
    });
  });

  describe('the two labels are never both present', () => {
    it('re-review: removes the stale review-done before applying review-in-progress', async () => {
      const harness = createHarness({ platform: 'github' });

      await executeReview(gitHubInput(), harness.deps);

      expect(harness.commandsBeforeInvoke).toEqual([
        GITHUB_REMOVE_DONE,
        GITHUB_ENSURE_IN_PROGRESS,
        GITHUB_ADD_IN_PROGRESS,
      ]);
    });
  });

  describe('label operations never change the review outcome', () => {
    it('apply fails: logs a warning and still reports completed with unchanged stats', async () => {
      const harness = createHarness({
        platform: 'github',
        failOn: new RegExp(`labels\\[\\]=${REVIEW_DONE_LABEL}`),
      });

      const result = await executeReview(gitHubInput(), harness.deps);

      expect(harness.warnMessages).toHaveLength(1);
      expect(harness.warnMessages[0]).toContain(REVIEW_DONE_LABEL);
      expect(result).toEqual({
        status: 'completed',
        stats: {
          score: 7.5,
          blocking: 1,
          warnings: 2,
          suggestions: 3,
          threadsOpened: 1,
          threadsClosed: 0,
          durationMs: 1000,
        },
      });
    });

    it('stale-removal fails: logs a warning, still applies review-in-progress and invokes Claude', async () => {
      const harness = createHarness({
        platform: 'github',
        failOn: new RegExp(`labels/${REVIEW_DONE_LABEL}`),
      });

      const result = await executeReview(gitHubInput(), harness.deps);

      expect(harness.warnMessages).toHaveLength(1);
      expect(harness.warnMessages[0]).toContain(REVIEW_DONE_LABEL);
      expect(harness.commands).toContain(GITHUB_ADD_IN_PROGRESS);
      expect(harness.claudeInvoker.invocations).toHaveLength(1);
      expect(result.status).toBe('completed');
    });
  });
});
