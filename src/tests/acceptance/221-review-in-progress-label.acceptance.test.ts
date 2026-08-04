import { describe, it, expect } from 'vitest';

import { REVIEW_IN_PROGRESS_LABEL } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import { GitHubReviewLabelCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.github.cli.gateway.js';
import { GitLabReviewLabelCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.gitlab.cli.gateway.js';
import { ClearReviewInProgressUseCase } from '@/modules/platform-integration/usecases/clearReviewInProgress.usecase.js';
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

const GITHUB_ENSURE = `gh label create '${REVIEW_IN_PROGRESS_LABEL}' --force -R 'test-owner/test-repo'`;
const GITHUB_ADD = `gh api --method POST 'repos/test-owner/test-repo/issues/123/labels' --field 'labels[]=${REVIEW_IN_PROGRESS_LABEL}'`;
const GITHUB_REMOVE = `gh api --method DELETE 'repos/test-owner/test-repo/issues/123/labels/${REVIEW_IN_PROGRESS_LABEL}'`;

const GITLAB_ENSURE = `glab api --method POST 'projects/test-org%2Ftest-project/labels' --field 'name=${REVIEW_IN_PROGRESS_LABEL}' --field 'color=#1f77b4'`;
const GITLAB_ADD = `glab api --method PUT 'projects/test-org%2Ftest-project/merge_requests/42' --field 'add_labels=${REVIEW_IN_PROGRESS_LABEL}'`;
const GITLAB_REMOVE = `glab api --method PUT 'projects/test-org%2Ftest-project/merge_requests/42' --field 'remove_labels=${REVIEW_IN_PROGRESS_LABEL}'`;

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

describe('SPEC-221 review-in-progress label (acceptance)', () => {
  describe('an initial review ensures then applies the label before Claude is invoked', () => {
    it('GitHub: ensures the label on the repository then applies it to the pull request', async () => {
      const harness = createHarness({ platform: 'github' });

      await executeReview(gitHubInput(), harness.deps);

      expect(harness.commandsBeforeInvoke).toEqual([GITHUB_ENSURE, GITHUB_ADD]);
    });

    it('GitLab: ensures the label on the project then applies it to the merge request', async () => {
      const harness = createHarness({ platform: 'gitlab' });

      await executeReview(gitLabInput(), harness.deps);

      expect(harness.commandsBeforeInvoke).toEqual([GITLAB_ENSURE, GITLAB_ADD]);
    });
  });

  describe('ensuring the label is idempotent', () => {
    it('applies the label without surfacing an error when the label already exists', async () => {
      const harness = createHarness({ platform: 'gitlab', failOn: /labels$/ });

      const result = await executeReview(gitLabInput(), harness.deps);

      expect(harness.commands).toContain(GITLAB_ADD);
      expect(result.status).toBe('completed');
      expect(harness.warnMessages).toEqual([]);
    });
  });

  describe('the label is removed on every terminal state', () => {
    it('removes the label when the review completes, with unchanged stats', async () => {
      const harness = createHarness({ platform: 'gitlab' });

      const result = await executeReview(gitLabInput(), harness.deps);

      expect(harness.commands.at(-1)).toBe(GITLAB_REMOVE);
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

    it('removes the label when the review is cancelled', async () => {
      const harness = createHarness({ platform: 'github' });
      harness.claudeInvoker.setResult({
        success: false,
        cancelled: true,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });

      const result = await executeReview(gitHubInput(), harness.deps);

      expect(harness.commands.at(-1)).toBe(GITHUB_REMOVE);
      expect(result.status).toBe('cancelled');
    });

    it('removes the label when Claude exits non-zero', async () => {
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

      expect(harness.commands.at(-1)).toBe(GITLAB_REMOVE);
      expect(result).toEqual({ status: 'failed', reason: 'exploded' });
    });

    it('removes the label when the review context is unreadable after the run', async () => {
      const job = ReviewJobFactory.create({ jobType: 'review' });
      const mergeRequestId = `gitlab-${job.projectPath}-${job.mrNumber}`;
      const harness = createHarness({
        platform: 'gitlab',
        duringInvoke: () => {
          harness.contextGateway.delete(job.localPath, mergeRequestId);
        },
      });

      const result = await executeReview(gitLabInput({ job }), harness.deps);

      expect(harness.commands.at(-1)).toBe(GITLAB_REMOVE);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toContain('review context is unreadable');
      }
    });
  });

  describe('label operations never change the review outcome', () => {
    it('still invokes Claude and completes when applying the label fails', async () => {
      const harness = createHarness({ platform: 'github', failOn: /--method POST/ });

      const result = await executeReview(gitHubInput(), harness.deps);

      expect(harness.claudeInvoker.invocations).toHaveLength(1);
      expect(result.status).toBe('completed');
      expect(harness.warnMessages).toHaveLength(1);
    });

    it('still completes when removing the label fails', async () => {
      const harness = createHarness({ platform: 'github', failOn: /--method DELETE/ });

      const result = await executeReview(gitHubInput(), harness.deps);

      expect(result.status).toBe('completed');
      expect(harness.warnMessages).toHaveLength(1);
    });
  });

  describe('follow-up reviews are untouched', () => {
    it('neither applies nor removes the label', async () => {
      const harness = createHarness({ platform: 'gitlab' });
      const job = ReviewJobFactory.createFollowup();

      const result = await executeReview(gitLabInput({ job, isFollowup: true }), harness.deps);

      expect(harness.commands).toEqual([]);
      expect(result.status).toBe('completed');
    });
  });
});
