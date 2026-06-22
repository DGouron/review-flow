import type { FastifyRequest, FastifyReply } from 'fastify';
import { vi } from 'vitest';

import type { GitHubWebhookDependencies } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';

import type { RepositoryConfig } from '../../../../../config/loader.js';

const mockConfig = {
  server: { port: 3000 },
  user: {
    gitlabUsername: 'claude-bot',
    githubUsername: 'claude-bot',
  },
  queue: { maxConcurrent: 1, deduplicationWindowMs: 60000 },
  repositories: [],
  github: {
    labelTrigger: 'claude-review',
  },
};

const mockRepoConfig: RepositoryConfig = {
  name: 'test-repo',
  platform: 'github',
  localPath: '/home/user/projects/test-repo',
  remoteUrl: 'https://github.com/test-owner/test-repo.git',
  skill: 'review-front',
  enabled: true,
};

vi.mock('../../../../../config/loader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  findRepositoryByRemoteUrl: vi.fn(() => mockRepoConfig),
  findRepositoryByProjectPath: vi.fn(() => mockRepoConfig),
}));

vi.mock('../../../../../security/verifier.js', () => ({
  verifyGitHubSignature: vi.fn(() => ({ valid: true })),
  getGitHubEventType: vi.fn(() => 'pull_request'),
}));

vi.mock('../../../../../frameworks/queue/pQueueAdapter.js', () => ({
  createJobId: vi.fn(() => 'github-test-owner/test-repo-123'),
  enqueueReview: vi.fn(() => Promise.resolve(true)),
  updateJobProgress: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock('../../../../../claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../../../../../main/websocket.js', () => ({
  startWatchingReviewContext: vi.fn(),
  stopWatchingReviewContext: vi.fn(),
}));

vi.mock('@/modules/review-execution/services/contextActionsExecutor.js', () => ({
  executeActionsFromContext: vi.fn(() =>
    Promise.resolve({ total: 1, succeeded: 1, failed: 0, skipped: 0 }),
  ),
}));

vi.mock('@/modules/review-execution/services/threadActionsExecutor.js', () => ({
  executeThreadActions: vi.fn(() =>
    Promise.resolve({ total: 0, succeeded: 0, failed: 0, skipped: 0 }),
  ),
  defaultCommandExecutor: vi.fn(),
}));

vi.mock('@/modules/review-execution/services/threadActionsParser.js', () => ({
  parseThreadActions: vi.fn(() => []),
}));

vi.mock('../../../../../config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getProjectAgents: vi.fn(() => null),
  getProjectAgentsOrFocusDefaults: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
  getProjectLanguage: vi.fn(() => 'en'),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import { handleGitHubWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import {
  processWebhook,
  type ProcessWebhookResult,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type { HandleCloseResult } from '@/modules/review-execution/usecases/handleClose.usecase.js';

import { findRepositoryByRemoteUrl } from '../../../../../config/loader.js';
import { enqueueReview } from '../../../../../frameworks/queue/pQueueAdapter.js';
import { verifyGitHubSignature, getGitHubEventType } from '../../../../../security/verifier.js';
import { GitHubEventFactory } from '../../../../factories/gitHubEvent.factory.js';
import { TrackedMrFactory } from '../../../../factories/trackedMr.factory.js';
import { createStubLogger } from '../../../../stubs/logger.stub.js';

function createMockDeps(): GitHubWebhookDependencies {
  const recordPush = { execute: vi.fn(() => null) };
  const transitionState = { execute: vi.fn() };
  const checkFollowupNeeded = { execute: vi.fn(() => false) };
  const removeWorktree = vi.fn(async () => ({ status: 'removed' as const }));
  const handlePlatformApproval = { execute: vi.fn(() => ({ kind: 'allowed' as const })) };
  const getQualityThreshold = vi.fn((): number | null => null);
  const handleClose = vi.fn(
    async (): Promise<HandleCloseResult> => ({
      status: 'cleaned',
      jobCancelled: true,
      trackingArchived: true,
      contextDeleted: true,
    }),
  );
  return {
    reviewContextGateway: {
      create: vi.fn(),
      read: vi.fn(() => null),
      delete: vi.fn(() => ({ deleted: true })),
      updateProgress: vi.fn(),
      appendAction: vi.fn(),
    },
    threadFetchGateway: {
      fetchThreads: vi.fn(() => []),
    },
    diffMetadataFetchGateway: {
      fetchDiffMetadata: vi.fn(() => ({
        baseSha: 'abc',
        headSha: 'def',
        startSha: 'ghi',
      })),
    },
    diffStatsFetchGateway: {
      fetchDiffStats: vi.fn(() => null),
    },
    trackAssignment: { execute: vi.fn() },
    recordCompletion: { execute: vi.fn() },
    recordPush,
    transitionState,
    checkFollowupNeeded,
    syncThreads: { execute: vi.fn(() => null) },
    executeReview: vi.fn(async () => ({
      status: 'completed',
      stats: {
        score: 9,
        blocking: 0,
        warnings: 0,
        suggestions: 0,
        threadsOpened: 0,
        threadsClosed: 0,
        durationMs: 1200,
      },
    })),
    handleClose,
    processWebhook: (event: WebhookEvent): Promise<ProcessWebhookResult> =>
      processWebhook(event, {
        handleClose,
        transitionState,
        recordPush,
        checkFollowupNeeded,
        removeWorktree,
        handlePlatformApproval,
        getQualityThreshold,
        logger: createStubLogger(),
      }),
    enforceBudget: {
      execute: vi.fn(async () => ({
        accepted: true,
        status: {
          limitUsd: 200,
          consumedUsd: 0,
          remainingUsd: 200,
          percentUsed: 0,
          exceeded: false,
          periodStart: '2026-05-01T00:00:00.000Z',
        },
      })),
    },
    broadcastBudgetExceeded: vi.fn(),
    getRepositories: vi.fn(() => []),
    removeWorktree,
    recordBypass: { execute: vi.fn(() => ({ kind: 'no-marker' })) },
    noteCommentPostGateway: { postComment: vi.fn(async () => undefined) },
    handlePlatformApproval,
    approvalRevocationGateway: { revoke: vi.fn(async () => undefined) },
    getQualityThreshold,
    guardDiffSize: { execute: vi.fn(() => ({ kind: 'allowed' })) },
    getMaxDiffLines: vi.fn(() => 2000),
    now: (): string => '2026-05-26T12:00:00.000Z',
  } as unknown as GitHubWebhookDependencies;
}

describe('handleGitHubWebhook', () => {
  let mockReply: FastifyReply;
  let mockDeps: GitHubWebhookDependencies;

  const logger = createStubLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    mockDeps = createMockDeps();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('PR tracking on review request', () => {
    it('should track PR assignment when review is requested', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.trackAssignment.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/home/user/projects/test-repo',
          mrInfo: expect.objectContaining({
            mrNumber: 123,
            title: 'Test PR',
            url: 'https://github.com/test-owner/test-repo/pull/123',
            project: 'test-owner/test-repo',
            platform: 'github',
            sourceBranch: 'feature/test',
            targetBranch: 'main',
          }),
          assignedBy: expect.objectContaining({
            username: 'developer',
          }),
        }),
      );
    });

    it('should track PR assignment when labeled with needs-review', async () => {
      const event = GitHubEventFactory.createLabeledPr('needs-review');
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.trackAssignment.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          mrInfo: expect.objectContaining({
            mrNumber: 123,
            platform: 'github',
          }),
        }),
      );
    });
  });

  describe('review completion callback', () => {
    it('delegates a review run to executeReview with the github review input', async () => {
      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.executeReview).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'github',
          isFollowup: false,
          notificationPrefix: 'PR #',
          job: expect.objectContaining({ projectPath: 'test-owner/test-repo', mrNumber: 123 }),
        }),
      );
    });

    it('throws to trigger queue retry when executeReview returns failed', async () => {
      vi.mocked(mockDeps.executeReview).mockResolvedValueOnce({
        status: 'failed',
        reason: 'dispatch-failed: branch-not-found',
      });
      const capturedMessages: string[] = [];
      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        try {
          await callback(job, new AbortController().signal);
        } catch (error) {
          capturedMessages.push(error instanceof Error ? error.message : String(error));
        }
        return true;
      });

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(capturedMessages).toEqual(['dispatch-failed: branch-not-found']);
    });
  });

  describe('assignedBy attribution', () => {
    it('should use PR assignee as assignedBy when assignee is present', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      event.pull_request.assignees = [{ login: 'pr-owner' }];
      event.sender = { login: 'reviewer-who-requested' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.trackAssignment.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedBy: expect.objectContaining({
            username: 'pr-owner',
            displayName: 'pr-owner',
          }),
        }),
      );
    });

    it('should fallback to sender when no assignee is present', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      event.pull_request.assignees = [];
      event.sender = { login: 'webhook-sender' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.trackAssignment.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedBy: expect.objectContaining({
            username: 'webhook-sender',
            displayName: 'webhook-sender',
          }),
        }),
      );
    });

    it('should use first assignee when multiple assignees exist', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      event.pull_request.assignees = [{ login: 'primary-owner' }, { login: 'secondary-owner' }];
      event.sender = { login: 'reviewer' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.trackAssignment.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedBy: expect.objectContaining({
            username: 'primary-owner',
            displayName: 'primary-owner',
          }),
        }),
      );
    });

    it('should fallback to sender when assignees field is undefined', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      (event.pull_request as Record<string, unknown>).assignees = undefined;
      event.sender = { login: 'fallback-sender' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.trackAssignment.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedBy: expect.objectContaining({
            username: 'fallback-sender',
            displayName: 'fallback-sender',
          }),
        }),
      );
    });
  });

  describe('budget cap gate', () => {
    it('rejects a fresh review and broadcasts budget-exceeded when enforceBudget returns accepted=false', async () => {
      const exceededDeps = createMockDeps() as unknown as {
        enforceBudget: { execute: ReturnType<typeof vi.fn> };
        broadcastBudgetExceeded: ReturnType<typeof vi.fn>;
      } & GitHubWebhookDependencies;
      exceededDeps.enforceBudget.execute = vi.fn(async () => ({
        accepted: false,
        status: {
          limitUsd: 200,
          consumedUsd: 200.1,
          remainingUsd: 0,
          percentUsed: 100.05,
          exceeded: true,
          periodStart: '2026-05-01T00:00:00.000Z',
        },
      }));

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, exceededDeps);

      expect(exceededDeps.enforceBudget.execute).toHaveBeenCalled();
      expect(enqueueReview).not.toHaveBeenCalled();
      expect(exceededDeps.broadcastBudgetExceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          mrNumber: 123,
          platform: 'github',
          projectPath: 'test-owner/test-repo',
          limitUsd: 200,
          consumedUsd: 200.1,
        }),
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', reason: 'budget-exceeded' }),
      );
    });

    it('enqueues a fresh review when enforceBudget returns accepted=true', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      const acceptedDeps = mockDeps as unknown as {
        enforceBudget: { execute: ReturnType<typeof vi.fn> };
        broadcastBudgetExceeded: ReturnType<typeof vi.fn>;
      };
      expect(acceptedDeps.enforceBudget.execute).toHaveBeenCalled();
      expect(enqueueReview).toHaveBeenCalled();
      expect(acceptedDeps.broadcastBudgetExceeded).not.toHaveBeenCalled();
    });
  });

  describe('followup branch on synchronize event', () => {
    function buildFollowupDeps(): GitHubWebhookDependencies {
      const deps = createMockDeps();
      const trackedMr = TrackedMrFactory.create({
        id: 'github-test-owner/test-repo-123',
        mrNumber: 123,
        platform: 'github',
        project: 'test-owner/test-repo',
        state: 'pending-fix',
        openThreads: 3,
        totalThreads: 3,
        lastPushAt: '2026-05-20T12:00:00Z',
        lastReviewAt: '2026-05-20T10:00:00Z',
        autoFollowup: true,
      });
      (deps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(trackedMr);
      (deps.checkFollowupNeeded.execute as ReturnType<typeof vi.fn>).mockReturnValue(true);
      return deps;
    }

    it('records push, checks followup, and enqueues followup job on synchronize', async () => {
      const deps = buildFollowupDeps();
      const event = GitHubEventFactory.createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(deps.recordPush.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/home/user/projects/test-repo',
          mrNumber: 123,
          platform: 'github',
        }),
      );
      expect(deps.checkFollowupNeeded.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/home/user/projects/test-repo',
          mrNumber: 123,
          platform: 'github',
        }),
      );
      expect(enqueueReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'followup',
          platform: 'github',
          mrNumber: 123,
        }),
        expect.any(Function),
      );
      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'followup-queued', prNumber: 123 }),
      );
    });

    it('does not enqueue when autoFollowup is disabled', async () => {
      const deps = buildFollowupDeps();
      const trackedMr = TrackedMrFactory.create({
        id: 'github-test-owner/test-repo-123',
        mrNumber: 123,
        platform: 'github',
        project: 'test-owner/test-repo',
        state: 'pending-fix',
        autoFollowup: false,
      });
      (deps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(trackedMr);

      const event = GitHubEventFactory.createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Auto-followup disabled' }),
      );
    });

    it('does not enqueue when checkFollowupNeeded returns false', async () => {
      const deps = buildFollowupDeps();
      (deps.checkFollowupNeeded.execute as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const event = GitHubEventFactory.createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('does not enqueue when no MR is tracked (recordPush returns null)', async () => {
      const deps = buildFollowupDeps();
      (deps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const event = GitHubEventFactory.createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('rejects followup when enforceBudget denies it', async () => {
      const deps = buildFollowupDeps();
      (deps.enforceBudget.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        accepted: false,
        status: {
          limitUsd: 200,
          consumedUsd: 200.1,
          remainingUsd: 0,
          percentUsed: 100.05,
          exceeded: true,
          periodStart: '2026-05-01T00:00:00.000Z',
        },
      });

      const event = GitHubEventFactory.createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(deps.broadcastBudgetExceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          mrNumber: 123,
          platform: 'github',
          projectPath: 'test-owner/test-repo',
        }),
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', reason: 'budget-exceeded' }),
      );
    });

    it('does not enqueue followup on draft PR synchronize', async () => {
      const deps = buildFollowupDeps();
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'synchronize',
        pull_request: { state: 'open', draft: true },
      });
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(deps.recordPush.execute).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('cross-fork PR detection (FR-8)', () => {
    it('populates ReviewJob.sourceForkCloneUrl on a fresh review when head.repo differs from base.repo', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      (event.pull_request.head as Record<string, unknown>).repo = {
        full_name: 'contributor/test-repo',
        clone_url: 'https://github.com/contributor/test-repo.git',
      };
      (event.pull_request.base as Record<string, unknown>).repo = {
        full_name: 'test-owner/test-repo',
      };

      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(enqueueReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'review',
          sourceForkCloneUrl: 'https://github.com/contributor/test-repo.git',
        }),
        expect.any(Function),
      );
    });

    it('leaves ReviewJob.sourceForkCloneUrl undefined for a same-repo review', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      (event.pull_request.head as Record<string, unknown>).repo = {
        full_name: 'test-owner/test-repo',
        clone_url: 'https://github.com/test-owner/test-repo.git',
      };
      (event.pull_request.base as Record<string, unknown>).repo = {
        full_name: 'test-owner/test-repo',
      };

      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(enqueueReview).toHaveBeenCalled();
      const enqueuedJob = vi.mocked(enqueueReview).mock.calls[0][0];
      expect(enqueuedJob.sourceForkCloneUrl).toBeUndefined();
    });

    it('propagates sourceForkCloneUrl to the followup job on cross-fork synchronize', async () => {
      const deps = createMockDeps();
      const trackedMr = TrackedMrFactory.create({
        id: 'github-test-owner/test-repo-123',
        mrNumber: 123,
        platform: 'github',
        project: 'test-owner/test-repo',
        state: 'pending-fix',
        openThreads: 3,
        totalThreads: 3,
        lastPushAt: '2026-05-20T12:00:00Z',
        lastReviewAt: '2026-05-20T10:00:00Z',
        autoFollowup: true,
      });
      (deps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(trackedMr);
      (deps.checkFollowupNeeded.execute as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const event = GitHubEventFactory.createSynchronizePr();
      (event.pull_request.head as Record<string, unknown>).repo = {
        full_name: 'contributor/test-repo',
        clone_url: 'https://github.com/contributor/test-repo.git',
      };
      (event.pull_request.base as Record<string, unknown>).repo = {
        full_name: 'test-owner/test-repo',
      };

      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'followup',
          sourceForkCloneUrl: 'https://github.com/contributor/test-repo.git',
        }),
        expect.any(Function),
      );
    });
  });

  describe('cleanup on PR close', () => {
    it('delegates cleanup to handleClose with the github identity on PR close', async () => {
      const deps = createMockDeps();
      const event = GitHubEventFactory.createClosedPr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(deps.handleClose).toHaveBeenCalledWith({
        platform: 'github',
        projectPath: 'test-owner/test-repo',
        localPath: '/home/user/projects/test-repo',
        mergeRequestNumber: 123,
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cleaned', prNumber: 123 }),
      );
    });

    it('keeps webhook response success when handleClose reports a failed cleanup outcome', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.handleClose).mockResolvedValueOnce({
        status: 'cleaned',
        jobCancelled: false,
        trackingArchived: false,
        contextDeleted: false,
      });
      const event = GitHubEventFactory.createClosedPr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'cleaned' }));
    });
  });

  describe('signature and event-type gating', () => {
    afterEach(() => {
      vi.mocked(verifyGitHubSignature).mockReturnValue({ valid: true });
      vi.mocked(getGitHubEventType).mockReturnValue('pull_request');
    });

    it('responds 401 when signature verification fails', async () => {
      vi.mocked(verifyGitHubSignature).mockReturnValue({
        valid: false,
        error: 'bad-signature',
      });

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'bad-signature' });
      expect(enqueueReview).not.toHaveBeenCalled();
    });

    it('ignores a non-PR event type', async () => {
      vi.mocked(getGitHubEventType).mockReturnValue('ping');

      const request = { body: {}, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Not a PR event' }),
      );
      expect(enqueueReview).not.toHaveBeenCalled();
    });

    it('responds 400 when the pull_request payload is not parseable', async () => {
      const request = {
        body: { not: 'a valid PR payload' },
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid webhook payload' }),
      );
      expect(enqueueReview).not.toHaveBeenCalled();
    });
  });

  describe('repository configuration gating', () => {
    afterEach(() => {
      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(mockRepoConfig);
    });

    it('ignores a review request when the repository is not configured', async () => {
      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(undefined);

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Repository not configured' }),
      );
      expect(enqueueReview).not.toHaveBeenCalled();
    });

    it('acknowledges a closed PR when the repository is not configured', async () => {
      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(undefined);

      const event = GitHubEventFactory.createClosedPr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.handleClose).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ignored',
          reason: 'PR closed, repo not configured',
        }),
      );
    });
  });

  describe('deduplication on enqueue', () => {
    it('responds 200 deduplicated when enqueueReview returns false', async () => {
      vi.mocked(enqueueReview).mockResolvedValue(false);

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'deduplicated' }),
      );
    });
  });

  describe('issue_comment hook', () => {
    afterEach(() => {
      vi.mocked(getGitHubEventType).mockReturnValue('pull_request');
    });

    function buildCommentRequest(body: string): FastifyRequest {
      vi.mocked(getGitHubEventType).mockReturnValue('issue_comment');
      return {
        body: {
          action: 'created',
          issue: { number: 123, pull_request: { url: 'https://api/pr/123' } },
          comment: { body, user: { login: 'commenter' } },
          repository: {
            full_name: 'test-owner/test-repo',
            html_url: 'https://github.com/test-owner/test-repo',
            clone_url: 'https://github.com/test-owner/test-repo.git',
          },
          sender: { login: 'commenter' },
        },
        headers: {},
      } as unknown as FastifyRequest;
    }

    it('ignores an unparseable issue_comment payload', async () => {
      vi.mocked(getGitHubEventType).mockReturnValue('issue_comment');
      const request = { body: { action: 'created' }, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Comment payload not parseable' }),
      );
    });

    it('ignores a comment for an unconfigured repository', async () => {
      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(undefined);
      const request = buildCommentRequest('/bypass: shipping hotfix');

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(mockRepoConfig);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Repository not configured' }),
      );
    });

    it('posts a comment and responds bypass-rejected when a marker has no reason', async () => {
      (mockDeps.recordBypass.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'rejected-missing-reason',
        message: 'Please provide a reason',
      });
      const request = buildCommentRequest('/bypass');

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.noteCommentPostGateway.postComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Please provide a reason' }),
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bypass-rejected', reason: 'missing-reason' }),
      );
    });

    it('responds bypass-recorded when a valid bypass marker is recorded', async () => {
      (mockDeps.recordBypass.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'recorded',
        bypass: { author: 'commenter', reason: 'hotfix', recordedAt: '2026-05-26T12:00:00.000Z' },
      });
      const request = buildCommentRequest('/bypass: hotfix');

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bypass-recorded' }),
      );
    });

    it('ignores a bypass marker on an untracked PR', async () => {
      (mockDeps.recordBypass.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'mr-not-found',
      });
      const request = buildCommentRequest('/bypass: hotfix');

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'PR not tracked' }),
      );
    });

    it('ignores a comment without a bypass marker', async () => {
      (mockDeps.recordBypass.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'no-marker',
      });
      const request = buildCommentRequest('just a normal comment');

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'No bypass marker' }),
      );
    });
  });

  describe('pull_request_review hook', () => {
    afterEach(() => {
      vi.mocked(getGitHubEventType).mockReturnValue('pull_request');
    });

    function buildApprovalRequest(): FastifyRequest {
      vi.mocked(getGitHubEventType).mockReturnValue('pull_request_review');
      return {
        body: {
          action: 'submitted',
          review: { id: 55, state: 'approved', user: { login: 'approver' } },
          pull_request: { number: 123, state: 'open' },
          repository: {
            full_name: 'test-owner/test-repo',
            clone_url: 'https://github.com/test-owner/test-repo.git',
          },
          sender: { login: 'approver' },
        },
        headers: {},
      } as unknown as FastifyRequest;
    }

    it('ignores an unparseable pull_request_review payload', async () => {
      vi.mocked(getGitHubEventType).mockReturnValue('pull_request_review');
      const request = { body: { action: 'submitted' }, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'pull_request_review payload not parseable' }),
      );
    });

    it('ignores a non-approval review', async () => {
      vi.mocked(getGitHubEventType).mockReturnValue('pull_request_review');
      const request = {
        body: {
          action: 'submitted',
          review: { id: 55, state: 'commented', user: { login: 'approver' } },
          pull_request: { number: 123, state: 'open' },
          repository: {
            full_name: 'test-owner/test-repo',
            clone_url: 'https://github.com/test-owner/test-repo.git',
          },
          sender: { login: 'approver' },
        },
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ignored',
          reason: 'Review state is commented, not approved',
        }),
      );
    });

    it('ignores an approval for an unconfigured repository', async () => {
      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(undefined);
      const request = buildApprovalRequest();

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      vi.mocked(findRepositoryByRemoteUrl).mockReturnValue(mockRepoConfig);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Repository not configured' }),
      );
    });

    it('marks the PR approved when the state transition succeeds', async () => {
      (mockDeps.transitionState.execute as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
      const request = buildApprovalRequest();

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved', prNumber: 123 }),
      );
    });

    it('revokes the approval and posts an FR comment when quality gate reverts it', async () => {
      (mockDeps.transitionState.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        ok: false,
        reason: 'quality-gate',
        message: 'gate failed',
      });
      (mockDeps.handlePlatformApproval.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'reverted',
        reason: 'below-threshold',
        message: 'Score trop bas',
      });
      const request = buildApprovalRequest();

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.approvalRevocationGateway.revoke).toHaveBeenCalledWith(
        expect.objectContaining({ mrNumber: 123, reviewId: 55 }),
      );
      expect(mockDeps.noteCommentPostGateway.postComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Score trop bas' }),
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unapproved', prNumber: 123, reason: 'below-threshold' }),
      );
    });

    it('keeps responding unapproved when the revocation gateway throws', async () => {
      (mockDeps.transitionState.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        ok: false,
        reason: 'quality-gate',
        message: 'gate failed',
      });
      (mockDeps.handlePlatformApproval.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'reverted',
        reason: 'blockers-present',
        message: 'Blocages restants',
      });
      (mockDeps.approvalRevocationGateway.revoke as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API down'),
      );
      (mockDeps.noteCommentPostGateway.postComment as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('comment failed'),
      );
      const request = buildApprovalRequest();

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unapproved', reason: 'blockers-present' }),
      );
    });

    it('ignores the approval when the quality gate verdict is not reverted', async () => {
      (mockDeps.transitionState.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        ok: false,
        reason: 'quality-gate',
        message: 'gate failed',
      });
      (mockDeps.handlePlatformApproval.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        kind: 'bypass-active',
      });
      const request = buildApprovalRequest();

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.approvalRevocationGateway.revoke).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', prNumber: 123, reason: 'bypass-active' }),
      );
    });

    it('ignores the approval when the transition fails for a non-quality-gate reason', async () => {
      (mockDeps.transitionState.execute as ReturnType<typeof vi.fn>).mockReturnValue({
        ok: false,
        reason: 'not-found',
      });
      const request = buildApprovalRequest();

      await handleGitHubWebhook(request, mockReply, logger, mockDeps);

      expect(mockDeps.handlePlatformApproval.execute).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', prNumber: 123, reason: 'not-found' }),
      );
    });
  });

  describe('gated invocation (gateClaudeInvocation present)', () => {
    it('responds 202 pending-confirmation when the gate parks the review', async () => {
      const deps = {
        ...mockDeps,
        gateClaudeInvocation: {
          execute: vi.fn(async () => ({ status: 'pending', pendingId: 'pending-1' })),
        },
      } as unknown as GitHubWebhookDependencies;

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending-confirmation',
          pendingId: 'pending-1',
          prNumber: 123,
        }),
      );
    });

    it('responds 202 queued when the gate enqueues the review', async () => {
      const deps = {
        ...mockDeps,
        gateClaudeInvocation: {
          execute: vi.fn(async () => ({ status: 'enqueued' })),
        },
      } as unknown as GitHubWebhookDependencies;

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'queued', prNumber: 123 }),
      );
    });

    it('responds 200 deduplicated when the gate deduplicates the review', async () => {
      const deps = {
        ...mockDeps,
        gateClaudeInvocation: {
          execute: vi.fn(async () => ({ status: 'deduplicated' })),
        },
      } as unknown as GitHubWebhookDependencies;

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'deduplicated' }),
      );
    });
  });
});
