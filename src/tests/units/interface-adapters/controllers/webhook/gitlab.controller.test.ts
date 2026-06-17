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
  name: 'test-project',
  platform: 'gitlab',
  localPath: '/home/user/projects/test-project',
  remoteUrl: 'https://gitlab.com/test-org/test-project.git',
  skill: 'review-front',
  enabled: true,
};

vi.mock('@/config/loader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  findRepositoryByProjectPath: vi.fn(() => mockRepoConfig),
}));

vi.mock('@/security/verifier.js', () => ({
  verifyGitLabSignature: vi.fn(() => ({ valid: true })),
  getGitLabEventType: vi.fn(() => 'Merge Request Hook'),
  getGitLabEventUuid: vi.fn(() => undefined),
}));

vi.mock('@/frameworks/queue/pQueueAdapter.js', () => ({
  createJobId: vi.fn(() => 'gitlab-test-org/test-project-42'),
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

vi.mock(
  '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js',
  () => ({
    ReviewContextFileSystemGateway: vi.fn().mockImplementation(() => ({
      create: vi.fn(),
      read: vi.fn(() => null),
      delete: vi.fn(() => ({ deleted: true })),
      updateProgress: vi.fn(),
    })),
  }),
);

vi.mock(
  '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js',
  () => ({
    GitLabThreadFetchGateway: vi.fn().mockImplementation(() => ({
      fetchThreads: vi.fn(() => []),
    })),
    defaultGitLabExecutor: vi.fn(),
  }),
);

vi.mock(
  '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js',
  () => ({
    GitLabDiffMetadataFetchGateway: vi.fn().mockImplementation(() => ({
      fetchDiffMetadata: vi.fn(() => undefined),
    })),
  }),
);

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { invokeClaudeReview } from '@/claude/invoker.js';
import { findRepositoryByProjectPath } from '@/config/loader.js';
import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import { MEMBER_ACCESS_LEVELS } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';
import {
  handleGitLabWebhook,
  extractBaseUrl,
  buildGitLabReviewProcessor,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { verifyGitLabSignature, getGitLabEventType } from '@/security/verifier.js';
import { GitLabEventFactory } from '@/tests/factories/gitLabEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubApprovalRevocationGateway } from '@/tests/stubs/approvalRevocation.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubMemberAccessGateway } from '@/tests/stubs/memberAccess.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';

function createMockTrackingGateway() {
  const basicMr = TrackedMrFactory.create({
    id: 'gitlab-test-org/test-project-42',
    mrNumber: 42,
    platform: 'gitlab',
    project: 'test-org/test-project',
  });

  return {
    getById: vi.fn((): TrackedMr | null => basicMr),
    getByNumber: vi.fn((): TrackedMr | null => null),
    create: vi.fn(),
    update: vi.fn(),
    getByState: vi.fn(() => []),
    getActiveMrs: vi.fn(() => []),
    remove: vi.fn(() => true),
    archive: vi.fn(() => true),
    recordReviewEvent: vi.fn(),
    recordPush: vi.fn((): TrackedMr | null => null),
    loadTracking: vi.fn(() => null),
    saveTracking: vi.fn(),
  };
}

function createStubContextGateway() {
  return {
    create: vi.fn(() => ({ success: true, filePath: '' })),
    read: vi.fn(() => null),
    delete: vi.fn(() => ({ success: true, deleted: true })),
    exists: vi.fn(() => false),
    getFilePath: vi.fn(() => ''),
    appendAction: vi.fn(() => ({ success: true })),
    updateProgress: vi.fn(() => ({ success: true })),
    setResult: vi.fn(() => ({ success: true })),
    listAll: vi.fn(() => []),
  };
}

function createAcceptAllEnforceBudget() {
  return {
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
  };
}

function createDefaultDeps(trackingGateway: ReturnType<typeof createMockTrackingGateway>) {
  const threadFetchGateway = { fetchThreads: vi.fn(() => []) };
  return {
    reviewContextGateway: createStubContextGateway(),
    threadFetchGateway,
    diffMetadataFetchGateway: {
      fetchDiffMetadata: vi.fn(() => ({ baseSha: 'abc', headSha: 'def', startSha: 'ghi' })),
    },
    diffStatsFetchGateway: { fetchDiffStats: vi.fn(() => null) },
    trackAssignment: new TrackAssignmentUseCase(trackingGateway),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGateway),
    recordPush: new RecordPushUseCase(trackingGateway),
    transitionState: new TransitionStateUseCase(trackingGateway),
    checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGateway),
    syncThreads: new SyncThreadsUseCase(trackingGateway, threadFetchGateway),
    enforceBudget: createAcceptAllEnforceBudget(),
    broadcastBudgetExceeded: vi.fn(),
    getRepositories: vi.fn(() => []),
    removeWorktree: vi.fn(async () => ({ status: 'removed' as const })),
    recordBypass: new RecordBypassUseCase(trackingGateway),
    noteCommentPostGateway: new StubNoteCommentPostGateway(),
    handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGateway),
    approvalRevocationGateway: new StubApprovalRevocationGateway(),
    getQualityThreshold: (): number | null => null,
    now: (): string => '2026-05-26T12:00:00.000Z',
  };
}

describe('handleGitLabWebhook', () => {
  let mockReply: FastifyReply;
  let mockGateway: ReturnType<typeof createMockTrackingGateway>;
  let defaultDeps: ReturnType<typeof createDefaultDeps>;

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

  describe('when MR is merged', () => {
    it('should transition state to merged via gateway', async () => {
      const event = GitLabEventFactory.createMergedMr();
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.update).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        'gitlab-test-org/test-project-42',
        expect.objectContaining({ state: 'merged' }),
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'merged' }));
    });
  });

  describe('when MR is approved', () => {
    it('should transition state to approved via gateway', async () => {
      const event = GitLabEventFactory.createApprovedMr();
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.update).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        'gitlab-test-org/test-project-42',
        expect.objectContaining({ state: 'approved' }),
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });
  });

  describe('assignedBy attribution', () => {
    it('should use MR assignee as assignedBy when assignee is present', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      event.assignees = [{ username: 'mr-owner', name: 'MR Owner' }];
      event.user = { username: 'reviewer-who-added', name: 'Reviewer Who Added' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'mr-owner',
            displayName: 'MR Owner',
          }),
        }),
      );
    });

    it('should fallback to event.user when no assignee is present', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      event.assignees = [];
      event.user = { username: 'webhook-trigger', name: 'Webhook Trigger' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'webhook-trigger',
            displayName: 'Webhook Trigger',
          }),
        }),
      );
    });

    it('should use first assignee when multiple assignees exist', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      event.assignees = [
        { username: 'primary-owner', name: 'Primary Owner' },
        { username: 'secondary-owner', name: 'Secondary Owner' },
      ];
      event.user = { username: 'reviewer', name: 'Reviewer' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'primary-owner',
            displayName: 'Primary Owner',
          }),
        }),
      );
    });

    it('should fallback to event.user when assignees field is undefined', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      (event as Record<string, unknown>).assignees = undefined;
      event.user = { username: 'fallback-user', name: 'Fallback User' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'fallback-user',
            displayName: 'Fallback User',
          }),
        }),
      );
    });
  });

  describe('dependency injection: reviewContextGateway', () => {
    it('should delete review context via injected gateway when MR is closed', async () => {
      const contextGateway = createStubContextGateway();
      const deps = { ...defaultDeps, reviewContextGateway: contextGateway };

      const event = GitLabEventFactory.createClosedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(contextGateway.delete).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        'gitlab-test-org/test-project-42',
      );
    });

    it('should create review context via injected gateway when review is enqueued', async () => {
      vi.mocked(invokeClaudeReview).mockResolvedValue({
        success: false,
        cancelled: true,
        stdout: '',
        stderr: '',
        exitCode: null,
        durationMs: 0,
      });
      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      const contextGateway = createStubContextGateway();
      const deps = { ...defaultDeps, reviewContextGateway: contextGateway };

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(contextGateway.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'gitlab',
          projectPath: 'test-org/test-project',
          mergeRequestNumber: 42,
        }),
      );
    });

    it('should use injected threadFetchGateway to fetch threads when review is enqueued', async () => {
      const stubThreadFetch = { fetchThreads: vi.fn(() => []) };
      const stubDiffMetadataFetch = {
        fetchDiffMetadata: vi.fn(() => ({ baseSha: 'a', headSha: 'b', startSha: 'c' })),
      };

      vi.mocked(invokeClaudeReview).mockResolvedValue({
        success: false,
        cancelled: true,
        stdout: '',
        stderr: '',
        exitCode: null,
        durationMs: 0,
      });
      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      const deps = {
        ...defaultDeps,
        threadFetchGateway: stubThreadFetch,
        diffMetadataFetchGateway: stubDiffMetadataFetch,
      };

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(stubThreadFetch.fetchThreads).toHaveBeenCalledWith('test-org/test-project', 42);
    });
  });

  describe('worktree cleanup on close and merge', () => {
    it('calls removeWorktree on MR close with platform/projectPath/mrNumber identity', async () => {
      const removeWorktree = vi.fn(async () => ({ status: 'removed' as const }));
      const deps = { ...defaultDeps, removeWorktree };
      const event = GitLabEventFactory.createClosedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(removeWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: {
            platform: 'gitlab',
            projectPath: 'test-org/test-project',
            mrNumber: 42,
          },
        }),
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('calls removeWorktree on MR merge with platform/projectPath/mrNumber identity', async () => {
      const removeWorktree = vi.fn(async () => ({ status: 'removed' as const }));
      const deps = { ...defaultDeps, removeWorktree };
      const event = GitLabEventFactory.createMergedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(removeWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: {
            platform: 'gitlab',
            projectPath: 'test-org/test-project',
            mrNumber: 42,
          },
        }),
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('keeps webhook response success when removeWorktree fails', async () => {
      const removeWorktree = vi.fn(async () => ({ status: 'failed' as const, warning: 'boom' }));
      const deps = { ...defaultDeps, removeWorktree };
      const event = GitLabEventFactory.createClosedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(removeWorktree).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'cleaned' }));
    });
  });

  describe('budget cap gate', () => {
    it('rejects a fresh review and broadcasts budget-exceeded when enforceBudget returns accepted=false', async () => {
      mockGateway.getById.mockReturnValue(null);
      const enforceBudget = {
        execute: vi.fn(async () => ({
          accepted: false,
          status: {
            limitUsd: 200,
            consumedUsd: 200.1,
            remainingUsd: 0,
            percentUsed: 100.05,
            exceeded: true,
            periodStart: '2026-05-01T00:00:00.000Z',
          },
        })),
      };
      const broadcastBudgetExceeded = vi.fn();
      const deps = { ...defaultDeps, enforceBudget, broadcastBudgetExceeded };

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(enforceBudget.execute).toHaveBeenCalled();
      expect(enqueueReview).not.toHaveBeenCalled();
      expect(broadcastBudgetExceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          mrNumber: 42,
          platform: 'gitlab',
          projectPath: 'test-org/test-project',
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
      mockGateway.getById.mockReturnValue(null);
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(defaultDeps.enforceBudget.execute).toHaveBeenCalled();
      expect(enqueueReview).toHaveBeenCalled();
      expect(defaultDeps.broadcastBudgetExceeded).not.toHaveBeenCalled();
    });
  });

  describe('trusted-actor trigger provenance gate (SPEC-197)', () => {
    function buildGatedDeps(
      memberAccess: StubMemberAccessGateway,
      pendingGateway: StubPendingReviewRequestGateway,
    ) {
      const gateClaudeInvocation = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'full-auto',
        pendingReviewRequestGateway: pendingGateway,
        enqueue: enqueueReview,
        broadcastPendingChanged: () => {},
        logger,
      });
      return {
        ...defaultDeps,
        gateClaudeInvocation,
        isTrustedActor: new IsTrustedActorUseCase(memberAccess),
      };
    }

    describe('AC1 - reviewer-added gate', () => {
      it('parks pending and never enqueues when the actor is a Reporter', async () => {
        mockGateway.getById.mockReturnValue(null);
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setAccess('reporter-actor', MEMBER_ACCESS_LEVELS.reporter);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
        event.user = { username: 'reporter-actor', name: 'Reporter Actor' };
        const request = { body: event, headers: {} } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(enqueueReview).not.toHaveBeenCalled();
        expect(pendingGateway.saveCount).toBe(1);
        expect(memberAccess.calls).toEqual([
          { projectPath: 'test-org/test-project', username: 'reporter-actor' },
        ]);
      });

      it('enqueues when the actor is a Developer', async () => {
        mockGateway.getById.mockReturnValue(null);
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
        event.user = { username: 'dev-actor', name: 'Dev Actor' };
        const request = { body: event, headers: {} } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(enqueueReview).toHaveBeenCalled();
        expect(pendingGateway.saveCount).toBe(0);
      });
    });

    describe('AC2 - followup / MR-update gate', () => {
      function buildFollowupMr(): TrackedMr {
        return TrackedMrFactory.create({
          id: 'gitlab-test-org/test-project-42',
          mrNumber: 42,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-review',
          openThreads: 3,
          autoFollowup: true,
          lastPushAt: '2026-05-26T12:00:00.000Z',
          lastReviewAt: '2026-05-25T12:00:00.000Z',
        });
      }

      it('parks pending and never enqueues a followup from a non-trusted actor', async () => {
        const followupMr = buildFollowupMr();
        mockGateway.getById.mockImplementation(() => followupMr);
        mockGateway.getByNumber.mockImplementation(() => followupMr);
        mockGateway.recordPush.mockImplementation(() => followupMr);
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setAccess('reporter-actor', MEMBER_ACCESS_LEVELS.reporter);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const event = GitLabEventFactory.createMrUpdate();
        event.user = { username: 'reporter-actor', name: 'Reporter Actor' };
        const request = { body: event, headers: {} } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(enqueueReview).not.toHaveBeenCalled();
        expect(pendingGateway.saveCount).toBe(1);
      });

      it('enqueues a followup from a Developer actor', async () => {
        const followupMr = buildFollowupMr();
        mockGateway.getById.mockImplementation(() => followupMr);
        mockGateway.getByNumber.mockImplementation(() => followupMr);
        mockGateway.recordPush.mockImplementation(() => followupMr);
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const event = GitLabEventFactory.createMrUpdate();
        event.user = { username: 'dev-actor', name: 'Dev Actor' };
        const request = { body: event, headers: {} } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(enqueueReview).toHaveBeenCalled();
        expect(pendingGateway.saveCount).toBe(0);
      });
    });

    describe('AC4 - fail-closed membership resolution', () => {
      function buildFollowupMr(): TrackedMr {
        return TrackedMrFactory.create({
          id: 'gitlab-test-org/test-project-42',
          mrNumber: 42,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-review',
          openThreads: 3,
          autoFollowup: true,
          lastPushAt: '2026-05-26T12:00:00.000Z',
          lastReviewAt: '2026-05-25T12:00:00.000Z',
        });
      }

      function buildNoteEvent(note: string) {
        return {
          object_kind: 'note',
          event_type: 'note',
          user: { username: 'note-author', name: 'Note Author' },
          project: {
            id: 1,
            name: 'test-project',
            path_with_namespace: 'test-org/test-project',
            web_url: 'https://gitlab.com/test-org/test-project',
            git_http_url: 'https://gitlab.com/test-org/test-project.git',
          },
          object_attributes: {
            id: 7,
            note,
            noteable_type: 'MergeRequest',
            noteable_id: 99,
          },
          merge_request: {
            iid: 42,
            title: 'Test MR',
            state: 'opened',
            source_branch: 'feature/test',
            target_branch: 'main',
            url: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
          },
        };
      }

      it('parks a reviewer-added trigger when membership resolution throws', async () => {
        mockGateway.getById.mockReturnValue(null);
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setShouldFail(true);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
        event.user = { username: 'dev-actor', name: 'Dev Actor' };
        const request = { body: event, headers: {} } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(enqueueReview).not.toHaveBeenCalled();
        expect(pendingGateway.saveCount).toBe(1);
      });

      it('parks a followup trigger when membership resolution throws', async () => {
        const followupMr = buildFollowupMr();
        mockGateway.getById.mockImplementation(() => followupMr);
        mockGateway.getByNumber.mockImplementation(() => followupMr);
        mockGateway.recordPush.mockImplementation(() => followupMr);
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setShouldFail(true);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const event = GitLabEventFactory.createMrUpdate();
        event.user = { username: 'dev-actor', name: 'Dev Actor' };
        const request = { body: event, headers: {} } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(enqueueReview).not.toHaveBeenCalled();
        expect(pendingGateway.saveCount).toBe(1);
      });

      it('parks a note trigger when membership resolution throws', async () => {
        vi.mocked(getGitLabEventType).mockReturnValueOnce('Note Hook');
        const memberAccess = new StubMemberAccessGateway();
        memberAccess.setShouldFail(true);
        const pendingGateway = new StubPendingReviewRequestGateway();
        const deps = buildGatedDeps(memberAccess, pendingGateway);

        const request = {
          body: buildNoteEvent('/bypass-quality "reason here"'),
          headers: {},
        } as unknown as FastifyRequest;

        await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

        expect(mockReply.status).toHaveBeenCalledWith(202);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'pending-confirmation', reason: 'untrusted-actor' }),
        );
        expect(mockGateway.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('extractBaseUrl', () => {
    it('returns protocol and host for an HTTPS remote', () => {
      expect(extractBaseUrl('https://gitlab.example.com/group/project.git')).toBe(
        'https://gitlab.example.com',
      );
    });

    it('returns https host for an SSH remote', () => {
      expect(extractBaseUrl('git@gitlab.example.com:group/project.git')).toBe(
        'https://gitlab.example.com',
      );
    });

    it('returns null for a remote that is neither http nor SSH-shaped', () => {
      expect(extractBaseUrl('ftp-only-no-at-no-colon-pattern')).toBeNull();
    });

    it('returns null when the HTTPS URL is malformed', () => {
      expect(extractBaseUrl('http://')).toBeNull();
    });
  });

  describe('request gating before payload parsing', () => {
    it('returns 401 when the GitLab signature is invalid', async () => {
      vi.mocked(verifyGitLabSignature).mockReturnValueOnce({ valid: false, error: 'bad-token' });
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'bad-token' });
      expect(enqueueReview).not.toHaveBeenCalled();
    });

    it('never queries the membership gateway when the token is invalid (SPEC-197 AC6)', async () => {
      vi.mocked(verifyGitLabSignature).mockReturnValueOnce({ valid: false, error: 'bad-token' });
      const memberAccess = new StubMemberAccessGateway();
      memberAccess.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
      const deps = { ...defaultDeps, isTrustedActor: new IsTrustedActorUseCase(memberAccess) };

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      event.user = { username: 'dev-actor', name: 'Dev Actor' };
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(memberAccess.calls.length).toBe(0);
    });

    it('ignores events that are neither Note Hook nor Merge Request Hook', async () => {
      vi.mocked(getGitLabEventType).mockReturnValueOnce('Pipeline Hook');
      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Not a MR event' }),
      );
    });

    it('returns 400 when the merge request payload is not parseable', async () => {
      const request = {
        body: { object_kind: 'merge_request' },
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid webhook payload' });
    });
  });

  describe('Note Hook handling', () => {
    function buildNoteEvent(note: string) {
      return {
        object_kind: 'note',
        event_type: 'note',
        user: { username: 'note-author', name: 'Note Author' },
        project: {
          id: 1,
          name: 'test-project',
          path_with_namespace: 'test-org/test-project',
          web_url: 'https://gitlab.com/test-org/test-project',
          git_http_url: 'https://gitlab.com/test-org/test-project.git',
        },
        object_attributes: {
          id: 7,
          note,
          noteable_type: 'MergeRequest',
          noteable_id: 99,
        },
        merge_request: {
          iid: 42,
          title: 'Test MR',
          state: 'opened',
          source_branch: 'feature/test',
          target_branch: 'main',
          url: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
        },
      };
    }

    beforeEach(() => {
      vi.mocked(getGitLabEventType).mockReturnValue('Note Hook');
    });

    it('ignores a note payload that does not match the note schema', async () => {
      const request = { body: { object_kind: 'note' }, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Note payload not parseable' }),
      );
    });

    it('ignores a note when the filter rejects it', async () => {
      const body = buildNoteEvent('hello');
      body.object_attributes.noteable_type = 'Issue';
      const request = { body, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'ignored' }));
    });

    it('ignores a note when the repository is not configured', async () => {
      vi.mocked(findRepositoryByProjectPath).mockReturnValueOnce(undefined);
      const request = { body: buildNoteEvent('hello'), headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Repository not configured' }),
      );
    });

    it('records a bypass when the note carries a valid bypass marker', async () => {
      const request = {
        body: buildNoteEvent('/bypass-quality "urgent hotfix"'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockGateway.update).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        'gitlab-test-org/test-project-42',
        expect.objectContaining({ bypass: expect.objectContaining({ reason: 'urgent hotfix' }) }),
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bypass-recorded' }),
      );
    });

    it('rejects a bypass marker that has no reason and posts an explanation comment', async () => {
      const noteCommentPostGateway = new StubNoteCommentPostGateway();
      const deps = { ...defaultDeps, noteCommentPostGateway };
      const request = {
        body: buildNoteEvent('/bypass-quality'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(noteCommentPostGateway.calls).toHaveLength(1);
      expect(noteCommentPostGateway.calls[0]).toEqual(
        expect.objectContaining({ projectPath: 'test-org/test-project', mrNumber: 42 }),
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bypass-rejected', reason: 'missing-reason' }),
      );
    });

    it('ignores a bypass marker when the MR is not tracked', async () => {
      mockGateway.getById.mockReturnValue(null);
      const request = {
        body: buildNoteEvent('/bypass-quality "reason here"'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'MR not tracked' }),
      );
    });

    it('ignores a note that carries no bypass marker', async () => {
      const request = {
        body: buildNoteEvent('just a normal comment'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'No bypass marker' }),
      );
    });

    it('parks a note trigger from a non-trusted actor (provenance gate)', async () => {
      const memberAccess = new StubMemberAccessGateway();
      memberAccess.setAccess('note-author', MEMBER_ACCESS_LEVELS.reporter);
      const deps = { ...defaultDeps, isTrustedActor: new IsTrustedActorUseCase(memberAccess) };
      const request = {
        body: buildNoteEvent('/bypass-quality "reason here"'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending-confirmation', reason: 'untrusted-actor' }),
      );
      expect(mockGateway.update).not.toHaveBeenCalled();
    });

    it('lets a note trigger from a Developer actor proceed past the provenance gate (AC3 positive)', async () => {
      const memberAccess = new StubMemberAccessGateway();
      memberAccess.setAccess('note-author', MEMBER_ACCESS_LEVELS.developer);
      const deps = { ...defaultDeps, isTrustedActor: new IsTrustedActorUseCase(memberAccess) };
      const request = {
        body: buildNoteEvent('/bypass-quality "reason here"'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(mockReply.status).not.toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bypass-recorded' }),
      );
    });
  });

  describe('closed MR with unconfigured repository', () => {
    it('acknowledges without cleanup when the repo is not configured', async () => {
      vi.mocked(findRepositoryByProjectPath).mockReturnValueOnce(undefined);
      const event = GitLabEventFactory.createClosedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'MR closed, repo not configured' }),
      );
    });
  });

  describe('approval quality gate', () => {
    function buildApprovedMr(overrides: Partial<TrackedMr> = {}): TrackedMr {
      return TrackedMrFactory.create({
        id: 'gitlab-test-org/test-project-42',
        mrNumber: 42,
        platform: 'gitlab',
        project: 'test-org/test-project',
        state: 'pending-review',
        latestScore: 4,
        openThreads: 0,
        bypass: null,
        ...overrides,
      });
    }

    it('revokes the platform approval and posts an FR comment when the quality gate fails', async () => {
      const trackedMr = buildApprovedMr();
      mockGateway.getById.mockReturnValue(trackedMr);
      const approvalRevocationGateway = new StubApprovalRevocationGateway();
      const noteCommentPostGateway = new StubNoteCommentPostGateway();
      const deps = {
        ...defaultDeps,
        approvalRevocationGateway,
        noteCommentPostGateway,
        getQualityThreshold: (): number | null => 8,
      };

      const event = GitLabEventFactory.createApprovedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(approvalRevocationGateway.calls).toHaveLength(1);
      expect(noteCommentPostGateway.calls).toHaveLength(1);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unapproved', mrNumber: 42 }),
      );
    });

    it('continues to post the FR comment when revoking the approval throws', async () => {
      const trackedMr = buildApprovedMr();
      mockGateway.getById.mockReturnValue(trackedMr);
      const approvalRevocationGateway = new StubApprovalRevocationGateway();
      approvalRevocationGateway.shouldThrow = true;
      const noteCommentPostGateway = new StubNoteCommentPostGateway();
      const deps = {
        ...defaultDeps,
        approvalRevocationGateway,
        noteCommentPostGateway,
        getQualityThreshold: (): number | null => 8,
      };

      const event = GitLabEventFactory.createApprovedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(noteCommentPostGateway.calls).toHaveLength(1);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unapproved', mrNumber: 42 }),
      );
    });

    it('ignores the approval when the MR is not tracked', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitLabEventFactory.createApprovedMr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'not-found', mrNumber: 42 }),
      );
    });
  });

  describe('followup budget gate', () => {
    function buildFollowupMr(): TrackedMr {
      return TrackedMrFactory.create({
        id: 'gitlab-test-org/test-project-42',
        mrNumber: 42,
        platform: 'gitlab',
        project: 'test-org/test-project',
        state: 'pending-review',
        openThreads: 3,
        autoFollowup: true,
        lastPushAt: '2026-05-26T12:00:00.000Z',
        lastReviewAt: '2026-05-25T12:00:00.000Z',
      });
    }

    it('rejects a followup and broadcasts when the budget is exceeded', async () => {
      const followupMr = buildFollowupMr();
      mockGateway.getById.mockReturnValue(followupMr);
      mockGateway.getByNumber.mockReturnValue(followupMr);
      mockGateway.recordPush.mockReturnValue(followupMr);
      const enforceBudget = {
        execute: vi.fn(async () => ({
          accepted: false,
          status: {
            limitUsd: 200,
            consumedUsd: 250,
            remainingUsd: 0,
            percentUsed: 125,
            exceeded: true,
            periodStart: '2026-05-01T00:00:00.000Z',
          },
        })),
      };
      const broadcastBudgetExceeded = vi.fn();
      const deps = { ...defaultDeps, enforceBudget, broadcastBudgetExceeded };

      const event = GitLabEventFactory.createMrUpdate();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(broadcastBudgetExceeded).toHaveBeenCalledWith(
        expect.objectContaining({ mrNumber: 42, platform: 'gitlab' }),
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', reason: 'budget-exceeded' }),
      );
    });

    it('skips the followup when auto-followup is disabled on the MR', async () => {
      const followupMr = TrackedMrFactory.create({
        id: 'gitlab-test-org/test-project-42',
        mrNumber: 42,
        platform: 'gitlab',
        project: 'test-org/test-project',
        state: 'pending-review',
        openThreads: 3,
        autoFollowup: false,
        lastPushAt: '2026-05-26T12:00:00.000Z',
        lastReviewAt: '2026-05-25T12:00:00.000Z',
      });
      mockGateway.getById.mockReturnValue(followupMr);
      mockGateway.getByNumber.mockReturnValue(followupMr);
      mockGateway.recordPush.mockReturnValue(followupMr);

      const event = GitLabEventFactory.createMrUpdate();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Auto-followup disabled' }),
      );
    });
  });

  describe('review processor build', () => {
    it('throws when no repository is configured for the job projectPath', async () => {
      vi.mocked(findRepositoryByProjectPath).mockReturnValueOnce(undefined);
      const processor = buildGitLabReviewProcessor(
        defaultDeps,
        logger,
      )({
        id: 'gitlab-test-org/test-project-42',
        platform: 'gitlab',
        projectPath: 'test-org/test-project',
        localPath: '/home/user/projects/test-project',
        mrNumber: 42,
        skill: 'review-front',
        mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
        sourceBranch: 'feature/test',
        targetBranch: 'main',
        jobType: 'review',
      });

      await expect(
        processor(
          {
            id: 'gitlab-test-org/test-project-42',
            platform: 'gitlab',
            projectPath: 'test-org/test-project',
            localPath: '/home/user/projects/test-project',
            mrNumber: 42,
            skill: 'review-front',
            mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
            sourceBranch: 'feature/test',
            targetBranch: 'main',
            jobType: 'review',
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow(/No GitLab repository configured/);
    });

    it('records completion stats on a successful review run', async () => {
      mockGateway.getById.mockReturnValue(null);
      const recordCompletion = new RecordReviewCompletionUseCase(mockGateway);
      const recordSpy = vi.spyOn(recordCompletion, 'execute');
      const diffStatsFetchGateway = { fetchDiffStats: vi.fn(() => null) };
      const deps = { ...defaultDeps, recordCompletion, diffStatsFetchGateway };

      vi.mocked(invokeClaudeReview).mockResolvedValue({
        success: true,
        cancelled: false,
        stdout: 'Score: 9/10',
        stderr: '',
        exitCode: 0,
        durationMs: 1200,
      });
      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, deps);

      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mrId: 'gitlab-test-org/test-project-42',
          reviewData: expect.objectContaining({ type: 'review' }),
        }),
      );
    });

    it('throws when a non-cancelled review run fails', async () => {
      mockGateway.getById.mockReturnValue(null);
      vi.mocked(invokeClaudeReview).mockResolvedValue({
        success: false,
        cancelled: false,
        stdout: '',
        stderr: 'boom',
        exitCode: 1,
        durationMs: 50,
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

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(capturedMessages).toEqual(['boom']);
    });
  });
});
