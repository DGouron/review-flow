import type { FastifyRequest, FastifyReply } from 'fastify';
import { vi } from 'vitest';

import type { RepositoryConfig } from '@/config/loader.js';

const mockConfig = {
  server: { port: 3000 },
  user: { gitlabUsername: 'claude-bot', githubUsername: 'claude-bot' },
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

import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import { MEMBER_ACCESS_LEVELS } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';
import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import { handleGitLabWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import {
  processWebhook,
  type ProcessWebhookResult,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import { ResolveAuditScopeUseCase } from '@/modules/review-execution/usecases/resolveAuditScope.usecase.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { RecordSizeBlockUseCase } from '@/modules/tracking/usecases/tracking/recordSizeBlock.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { verifyGitLabSignature, getGitLabEventType } from '@/security/verifier.js';
import { GitLabEventFactory } from '@/tests/factories/gitLabEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubApprovalRevocationGateway } from '@/tests/stubs/approvalRevocation.stub.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubMemberAccessGateway } from '@/tests/stubs/memberAccess.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';
import { StubProjectPrinciplesGateway } from '@/tests/stubs/projectPrinciples.stub.js';

const logger = createStubLogger();

const TRACKED_MR_ID = 'gitlab-test-org/test-project-42';
const PROJECT_PATH = 'test-org/test-project';

function createMockTrackingGateway(initialMr: TrackedMr | null) {
  return {
    getById: vi.fn((): TrackedMr | null => initialMr),
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

function buildBaseDeps(trackingGateway: ReturnType<typeof createMockTrackingGateway>) {
  const threadFetchGateway = { fetchThreads: vi.fn(() => []) };
  const recordPush = new RecordPushUseCase(trackingGateway);
  const transitionState = new TransitionStateUseCase(trackingGateway);
  const checkFollowupNeeded = new CheckFollowupNeededUseCase(trackingGateway);
  const removeWorktree = vi.fn(async () => ({ status: 'removed' as const }));
  const handleClose = vi.fn(async () => ({
    status: 'cleaned' as const,
    jobCancelled: true,
    trackingArchived: true,
    contextDeleted: true,
  }));
  return {
    reviewContextGateway: createStubContextGateway(),
    threadFetchGateway,
    diffMetadataFetchGateway: {
      fetchDiffMetadata: vi.fn(() => ({ baseSha: 'abc', headSha: 'def', startSha: 'ghi' })),
    },
    diffStatsFetchGateway: { fetchDiffStats: vi.fn(() => null) },
    trackAssignment: new TrackAssignmentUseCase(trackingGateway),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGateway),
    recordPush,
    transitionState,
    checkFollowupNeeded,
    syncThreads: new SyncThreadsUseCase(trackingGateway, threadFetchGateway),
    executeReview: vi.fn(async () => ({
      status: 'completed' as const,
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
        handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGateway),
        getQualityThreshold: (): number | null => null,
        logger,
      }),
    enforceBudget: createAcceptAllEnforceBudget(),
    broadcastBudgetExceeded: vi.fn(),
    getRepositories: vi.fn(() => []),
    removeWorktree,
    recordBypass: new RecordBypassUseCase(trackingGateway),
    recordSizeBlock: new RecordSizeBlockUseCase(trackingGateway),
    noteCommentPostGateway: new StubNoteCommentPostGateway(),
    handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGateway),
    approvalRevocationGateway: new StubApprovalRevocationGateway(),
    getQualityThreshold: (): number | null => null,
    guardDiffSize: new GuardDiffSizeUseCase({
      changedFilesFetchGateway: new StubChangedFilesFetchGateway(),
    }),
    getMaxDiffLines: (): number => 2000,
    now: (): string => '2026-05-26T12:00:00.000Z',
    projectPrinciplesGateway: new StubProjectPrinciplesGateway(),
    resolveAuditScope: new ResolveAuditScopeUseCase(),
  };
}

/**
 * Wires the SPEC-197 chokepoint: a real IsTrustedActorUseCase backed by the recording
 * StubMemberAccessGateway, and a real full-auto GateClaudeInvocationUseCase whose park
 * branch saves into the StubPendingReviewRequestGateway. Observable job state is the only
 * thing asserted — enqueue call count, pending saveCount, and the HTTP reply.
 */
function buildGatedDeps(
  trackingGateway: ReturnType<typeof createMockTrackingGateway>,
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
    ...buildBaseDeps(trackingGateway),
    gateClaudeInvocation,
    isTrustedActor: new IsTrustedActorUseCase(memberAccess),
  };
}

function buildFollowupMr(): TrackedMr {
  return TrackedMrFactory.create({
    id: TRACKED_MR_ID,
    mrNumber: 42,
    platform: 'gitlab',
    project: PROJECT_PATH,
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
      path_with_namespace: PROJECT_PATH,
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

function asRequest(body: unknown): FastifyRequest {
  return { body, headers: {} } as unknown as FastifyRequest;
}

describe('SPEC-197 trusted-actor trigger provenance gate (acceptance — full chokepoint handleGitLabWebhook)', () => {
  let mockReply: FastifyReply;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('AC1 — reviewer-added gate', () => {
    it('parks a reviewer-added trigger from a Reporter and enqueues one from a Developer', async () => {
      const reporterTracking = createMockTrackingGateway(null);
      const reporterMembers = new StubMemberAccessGateway();
      reporterMembers.setAccess('reporter-actor', MEMBER_ACCESS_LEVELS.reporter);
      const reporterPending = new StubPendingReviewRequestGateway();
      const reporterDeps = buildGatedDeps(reporterTracking, reporterMembers, reporterPending);

      const reporterEvent = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      reporterEvent.user = { username: 'reporter-actor', name: 'Reporter Actor' };

      await handleGitLabWebhook(asRequest(reporterEvent), mockReply, logger, reporterDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(reporterPending.saveCount).toBe(1);

      const developerTracking = createMockTrackingGateway(null);
      const developerMembers = new StubMemberAccessGateway();
      developerMembers.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
      const developerPending = new StubPendingReviewRequestGateway();
      const developerDeps = buildGatedDeps(developerTracking, developerMembers, developerPending);

      const developerEvent = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      developerEvent.user = { username: 'dev-actor', name: 'Dev Actor' };

      await handleGitLabWebhook(asRequest(developerEvent), mockReply, logger, developerDeps);

      expect(enqueueReview).toHaveBeenCalledTimes(1);
      expect(developerPending.saveCount).toBe(0);
    });
  });

  describe('AC2 — followup / MR-update gate', () => {
    it('parks a followup from a Reporter and enqueues one from a Developer (payloads differ only by username)', async () => {
      const reporterTracking = createMockTrackingGateway(buildFollowupMr());
      reporterTracking.getByNumber.mockReturnValue(buildFollowupMr());
      reporterTracking.recordPush.mockReturnValue(buildFollowupMr());
      const reporterMembers = new StubMemberAccessGateway();
      reporterMembers.setAccess('reporter-actor', MEMBER_ACCESS_LEVELS.reporter);
      const reporterPending = new StubPendingReviewRequestGateway();
      const reporterDeps = buildGatedDeps(reporterTracking, reporterMembers, reporterPending);

      const reporterEvent = GitLabEventFactory.createMrUpdate();
      reporterEvent.user = { username: 'reporter-actor', name: 'Reporter Actor' };

      await handleGitLabWebhook(asRequest(reporterEvent), mockReply, logger, reporterDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(reporterPending.saveCount).toBe(1);

      const developerTracking = createMockTrackingGateway(buildFollowupMr());
      developerTracking.getByNumber.mockReturnValue(buildFollowupMr());
      developerTracking.recordPush.mockReturnValue(buildFollowupMr());
      const developerMembers = new StubMemberAccessGateway();
      developerMembers.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
      const developerPending = new StubPendingReviewRequestGateway();
      const developerDeps = buildGatedDeps(developerTracking, developerMembers, developerPending);

      const developerEvent = GitLabEventFactory.createMrUpdate();
      developerEvent.user = { username: 'dev-actor', name: 'Dev Actor' };

      await handleGitLabWebhook(asRequest(developerEvent), mockReply, logger, developerDeps);

      expect(enqueueReview).toHaveBeenCalledTimes(1);
      expect(developerPending.saveCount).toBe(0);
    });
  });

  describe('AC3 — note / comment gate', () => {
    it('parks a note from a Reporter with 202 untrusted-actor and lets a Developer note proceed', async () => {
      vi.mocked(getGitLabEventType).mockReturnValue('Note Hook');

      const reporterTracking = createMockTrackingGateway(
        TrackedMrFactory.create({
          id: TRACKED_MR_ID,
          mrNumber: 42,
          platform: 'gitlab',
          project: PROJECT_PATH,
        }),
      );
      const reporterMembers = new StubMemberAccessGateway();
      reporterMembers.setAccess('note-author', MEMBER_ACCESS_LEVELS.reporter);
      const reporterPending = new StubPendingReviewRequestGateway();
      const reporterDeps = buildGatedDeps(reporterTracking, reporterMembers, reporterPending);

      await handleGitLabWebhook(
        asRequest(buildNoteEvent('/bypass-quality "reason here"')),
        mockReply,
        logger,
        reporterDeps,
      );

      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending-confirmation', reason: 'untrusted-actor' }),
      );
      expect(reporterTracking.update).not.toHaveBeenCalled();

      const developerTracking = createMockTrackingGateway(
        TrackedMrFactory.create({
          id: TRACKED_MR_ID,
          mrNumber: 42,
          platform: 'gitlab',
          project: PROJECT_PATH,
        }),
      );
      const developerMembers = new StubMemberAccessGateway();
      developerMembers.setAccess('note-author', MEMBER_ACCESS_LEVELS.developer);
      const developerPending = new StubPendingReviewRequestGateway();
      const developerDeps = buildGatedDeps(developerTracking, developerMembers, developerPending);
      const developerReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      } as unknown as FastifyReply;

      await handleGitLabWebhook(
        asRequest(buildNoteEvent('/bypass-quality "reason here"')),
        developerReply,
        logger,
        developerDeps,
      );

      expect(developerReply.status).not.toHaveBeenCalledWith(202);
      expect(developerReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'bypass-recorded' }),
      );
    });
  });

  describe('AC4 — fail-closed membership resolution', () => {
    it('parks every trigger type when membership resolution throws', async () => {
      const reviewerTracking = createMockTrackingGateway(null);
      const reviewerMembers = new StubMemberAccessGateway();
      reviewerMembers.setShouldFail(true);
      const reviewerPending = new StubPendingReviewRequestGateway();
      const reviewerDeps = buildGatedDeps(reviewerTracking, reviewerMembers, reviewerPending);

      const reviewerEvent = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      reviewerEvent.user = { username: 'dev-actor', name: 'Dev Actor' };

      await handleGitLabWebhook(asRequest(reviewerEvent), mockReply, logger, reviewerDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(reviewerPending.saveCount).toBe(1);

      const followupTracking = createMockTrackingGateway(buildFollowupMr());
      followupTracking.getByNumber.mockReturnValue(buildFollowupMr());
      followupTracking.recordPush.mockReturnValue(buildFollowupMr());
      const followupMembers = new StubMemberAccessGateway();
      followupMembers.setShouldFail(true);
      const followupPending = new StubPendingReviewRequestGateway();
      const followupDeps = buildGatedDeps(followupTracking, followupMembers, followupPending);

      const followupEvent = GitLabEventFactory.createMrUpdate();
      followupEvent.user = { username: 'dev-actor', name: 'Dev Actor' };

      await handleGitLabWebhook(asRequest(followupEvent), mockReply, logger, followupDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(followupPending.saveCount).toBe(1);

      vi.mocked(getGitLabEventType).mockReturnValue('Note Hook');
      const noteTracking = createMockTrackingGateway(
        TrackedMrFactory.create({
          id: TRACKED_MR_ID,
          mrNumber: 42,
          platform: 'gitlab',
          project: PROJECT_PATH,
        }),
      );
      const noteMembers = new StubMemberAccessGateway();
      noteMembers.setShouldFail(true);
      const notePending = new StubPendingReviewRequestGateway();
      const noteDeps = buildGatedDeps(noteTracking, noteMembers, notePending);
      const noteReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      } as unknown as FastifyReply;

      await handleGitLabWebhook(
        asRequest(buildNoteEvent('/bypass-quality "reason here"')),
        noteReply,
        logger,
        noteDeps,
      );

      expect(noteReply.status).toHaveBeenCalledWith(202);
      expect(noteReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending-confirmation', reason: 'untrusted-actor' }),
      );
      expect(noteTracking.update).not.toHaveBeenCalled();
    });
  });

  describe('AC5 — cache does not widen trust', () => {
    it('parks a trigger from an unprimed username even after another username resolved Developer', async () => {
      const memberAccess = new StubMemberAccessGateway();
      memberAccess.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
      const pendingGateway = new StubPendingReviewRequestGateway();

      const trustedTracking = createMockTrackingGateway(null);
      const trustedDeps = buildGatedDeps(trustedTracking, memberAccess, pendingGateway);
      const trustedEvent = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      trustedEvent.user = { username: 'dev-actor', name: 'Dev Actor' };

      await handleGitLabWebhook(asRequest(trustedEvent), mockReply, logger, trustedDeps);

      expect(enqueueReview).toHaveBeenCalledTimes(1);
      expect(pendingGateway.saveCount).toBe(0);

      const malloryTracking = createMockTrackingGateway(null);
      const malloryDeps = buildGatedDeps(malloryTracking, memberAccess, pendingGateway);
      const malloryEvent = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      malloryEvent.user = { username: 'mallory', name: 'Mallory' };

      await handleGitLabWebhook(asRequest(malloryEvent), mockReply, logger, malloryDeps);

      expect(enqueueReview).toHaveBeenCalledTimes(1);
      expect(pendingGateway.saveCount).toBe(1);
      expect(memberAccess.calls).toEqual([
        { projectPath: PROJECT_PATH, username: 'dev-actor' },
        { projectPath: PROJECT_PATH, username: 'mallory' },
      ]);
    });
  });

  describe('AC6 — token-boundary ordering', () => {
    it('rejects an invalid-token trigger with 401 and never queries the membership gateway', async () => {
      vi.mocked(verifyGitLabSignature).mockReturnValueOnce({ valid: false, error: 'bad-token' });
      const tracking = createMockTrackingGateway(null);
      const memberAccess = new StubMemberAccessGateway();
      memberAccess.setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer);
      const pendingGateway = new StubPendingReviewRequestGateway();
      const deps = buildGatedDeps(tracking, memberAccess, pendingGateway);

      const event = GitLabEventFactory.createWithReviewerAdded('claude-bot');
      event.user = { username: 'dev-actor', name: 'Dev Actor' };

      await handleGitLabWebhook(asRequest(event), mockReply, logger, deps);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'bad-token' });
      expect(enqueueReview).not.toHaveBeenCalled();
      expect(memberAccess.calls.length).toBe(0);
    });
  });
});
