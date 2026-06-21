import type { FastifyRequest, FastifyReply } from 'fastify';
import { vi } from 'vitest';

import type { RepositoryConfig } from '@/config/loader.js';

const mockConfig = {
  server: { port: 3000 },
  user: {
    gitlabUsername: 'claude-bot',
    githubUsername: 'claude-bot',
  },
  queue: { maxConcurrent: 1, deduplicationWindowMs: 60000 },
  repositories: [],
};

const mockRepoConfig: RepositoryConfig = {
  name: 'test-repo',
  platform: 'github',
  localPath: '/home/user/projects/test-repo',
  remoteUrl: 'https://github.com/test-owner/test-repo.git',
  skill: 'review-front',
  enabled: true,
};

vi.mock('@/config/loader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  findRepositoryByRemoteUrl: vi.fn(() => mockRepoConfig),
}));

vi.mock('@/security/verifier.js', () => ({
  verifyGitHubSignature: vi.fn(() => ({ valid: true })),
  getGitHubEventType: vi.fn(() => 'pull_request'),
}));

vi.mock('@/frameworks/queue/pQueueAdapter.js', () => ({
  createJobId: vi.fn(
    (prefix: string, projectPath: string, mrNumber: number) =>
      `${prefix}-${projectPath}-${mrNumber}`,
  ),
  enqueueReview: vi.fn(() => Promise.resolve(true)),
  updateJobProgress: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock('@/claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('@/main/websocket.js', () => ({
  startWatchingReviewContext: vi.fn(),
  stopWatchingReviewContext: vi.fn(),
}));

vi.mock('@/config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getProjectAgents: vi.fn(() => null),
  getProjectAgentsOrFocusDefaults: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
  getProjectLanguage: vi.fn(() => 'en'),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import { handleGitHubWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import type { GitHubWebhookDependencies } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import {
  processWebhook,
  type ProcessWebhookResult,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { TransitionStateResult } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { GitHubEventFactory } from '@/tests/factories/gitHubEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

function createSynchronizePr() {
  return GitHubEventFactory.createPullRequestEvent({
    action: 'synchronize',
    pull_request: {
      state: 'open',
      draft: false,
    },
  });
}

const NO_TRACKED_MR = Symbol('NO_TRACKED_MR');

function createMockTrackingGateway(mrOverride: Partial<TrackedMr> | typeof NO_TRACKED_MR = {}) {
  const trackedMr =
    mrOverride === NO_TRACKED_MR
      ? null
      : TrackedMrFactory.create({
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
          ...mrOverride,
        });

  return {
    getById: vi.fn((): TrackedMr | null => trackedMr),
    getByNumber: vi.fn((): TrackedMr | null => trackedMr),
    create: vi.fn(),
    update: vi.fn(),
    getByState: vi.fn(() => []),
    getActiveMrs: vi.fn(() => []),
    remove: vi.fn(() => true),
    archive: vi.fn(() => true),
    recordReviewEvent: vi.fn(),
    recordPush: vi.fn((): TrackedMr | null => trackedMr),
    loadTracking: vi.fn(() => null),
    saveTracking: vi.fn(),
  };
}

function createDefaultDeps(
  trackingGateway: ReturnType<typeof createMockTrackingGateway>,
): GitHubWebhookDependencies {
  const threadFetchGateway = { fetchThreads: vi.fn(() => []) };
  const recordPushExecute = vi.fn();
  recordPushExecute.mockImplementation(() => trackingGateway.recordPush());
  const checkFollowupNeededExecute = vi.fn();
  checkFollowupNeededExecute.mockReturnValue(true);
  const enforceBudgetExecute = vi.fn();
  enforceBudgetExecute.mockResolvedValue({
    accepted: true,
    status: {
      limitUsd: 200,
      consumedUsd: 0,
      remainingUsd: 200,
      percentUsed: 0,
      exceeded: false,
      periodStart: '2026-05-01T00:00:00.000Z',
    },
  });
  return {
    reviewContextGateway: {
      create: vi.fn(() => ({ success: true, filePath: '' })),
      read: vi.fn(() => null),
      delete: vi.fn(() => ({ success: true, deleted: true })),
      exists: vi.fn(() => false),
      getFilePath: vi.fn(() => ''),
      appendAction: vi.fn(() => ({ success: true })),
      updateProgress: vi.fn(() => ({ success: true })),
      setResult: vi.fn(() => ({ success: true })),
    },
    threadFetchGateway,
    diffMetadataFetchGateway: {
      fetchDiffMetadata: vi.fn(() => ({ baseSha: 'abc', headSha: 'def', startSha: 'ghi' })),
    },
    diffStatsFetchGateway: { fetchDiffStats: vi.fn(() => null) },
    trackAssignment: { execute: vi.fn() },
    recordCompletion: { execute: vi.fn() },
    recordPush: { execute: recordPushExecute },
    transitionState: { execute: vi.fn() },
    checkFollowupNeeded: { execute: checkFollowupNeededExecute },
    syncThreads: { execute: vi.fn(() => null) },
    processWebhook: (event: WebhookEvent): Promise<ProcessWebhookResult> =>
      processWebhook(event, {
        handleClose: async () => ({
          status: 'cleaned',
          jobCancelled: false,
          trackingArchived: false,
          contextDeleted: false,
        }),
        transitionState: { execute: vi.fn((): TransitionStateResult => ({ ok: true })) },
        recordPush: { execute: recordPushExecute },
        checkFollowupNeeded: { execute: checkFollowupNeededExecute },
        removeWorktree: async () => ({ status: 'removed' }),
        logger: createStubLogger(),
      }),
    enforceBudget: { execute: enforceBudgetExecute },
    broadcastBudgetExceeded: vi.fn(),
    getRepositories: vi.fn(() => []),
  } as unknown as GitHubWebhookDependencies;
}

describe('Acceptance — Spec #46: GitHub Followup Review on Push', () => {
  let mockReply: FastifyReply;
  let mockGateway: ReturnType<typeof createMockTrackingGateway>;
  let defaultDeps: GitHubWebhookDependencies;
  const logger = createStubLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    mockGateway = createMockTrackingGateway();
    defaultDeps = createDefaultDeps(mockGateway);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Feature: Push-Triggered Followup on GitHub PR', () => {
    it('Push triggers followup on PR with open blocking threads', async () => {
      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, defaultDeps);

      expect(defaultDeps.recordPush.execute).toHaveBeenCalledWith(
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

    it('No followup when autoFollowup is disabled', async () => {
      mockGateway = createMockTrackingGateway({ autoFollowup: false });
      defaultDeps = createDefaultDeps(mockGateway);

      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Auto-followup disabled' }),
      );
    });

    it('No followup when PR has no open threads (checkFollowupNeeded returns false)', async () => {
      const noFollowupDeps = createDefaultDeps(mockGateway);
      (noFollowupDeps.checkFollowupNeeded.execute as ReturnType<typeof vi.fn>).mockReturnValue(
        false,
      );

      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, noFollowupDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'ignored' }));
    });

    it('No followup when PR is not tracked (no MR found)', async () => {
      mockGateway = createMockTrackingGateway(NO_TRACKED_MR);
      defaultDeps = createDefaultDeps(mockGateway);
      (defaultDeps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'ignored' }));
    });

    it('Push on draft PR is ignored', async () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'synchronize',
        pull_request: {
          state: 'open',
          draft: true,
        },
      });
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(defaultDeps.recordPush.execute).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('Push on closed PR is ignored', async () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'synchronize',
        pull_request: {
          state: 'closed',
          draft: false,
        },
      });
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(defaultDeps.recordPush.execute).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // The "Platform-aware MCP system prompt" suite was removed in SPEC-170:
  // FR-7 deletes the "UNRELIABLE / FORBIDDEN" disclaimer block and the
  // glab/gh CLI command interpolation from buildMcpSystemPrompt. The new
  // contract ("prompt no longer disclaims local state") is asserted by the
  // SPEC-170 acceptance test, scenario 11.
});
