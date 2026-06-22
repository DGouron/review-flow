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
  getGitLabEventUuid: vi.fn((request: FastifyRequest) => request.headers['x-gitlab-event-uuid']),
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

import { describe, it, expect, beforeEach } from 'vitest';

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import { handleGitLabWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { InMemoryIdempotencyStore } from '@/modules/platform-integration/interface-adapters/gateways/inMemoryIdempotencyStore.gateway.js';
import { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import {
  processWebhook,
  type ProcessWebhookResult,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type {
  GateClaudeInvocationInput,
  GateClaudeInvocationResult,
} from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { GitLabEventFactory } from '@/tests/factories/gitLabEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubApprovalRevocationGateway } from '@/tests/stubs/approvalRevocation.stub.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';
import { StubIdempotencyStore } from '@/tests/stubs/idempotencyStore.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';

class StubGateClaudeInvocation {
  invocationCount = 0;
  private readonly result: GateClaudeInvocationResult;

  constructor(
    result: GateClaudeInvocationResult = {
      status: 'enqueued',
      jobId: 'gitlab-test-org/test-project-42',
    },
  ) {
    this.result = result;
  }

  async execute(_input: GateClaudeInvocationInput): Promise<GateClaudeInvocationResult> {
    this.invocationCount += 1;
    return this.result;
  }
}

function createMockTrackingGateway() {
  const basicMr = TrackedMrFactory.create({
    id: 'gitlab-test-org/test-project-42',
    mrNumber: 42,
    platform: 'gitlab',
    project: 'test-org/test-project',
  });

  return {
    getById: vi.fn((): TrackedMr | null => basicMr),
    getByNumber: vi.fn(() => null),
    create: vi.fn(),
    update: vi.fn(),
    getByState: vi.fn(() => []),
    getActiveMrs: vi.fn(() => []),
    remove: vi.fn(() => true),
    archive: vi.fn(() => true),
    recordReviewEvent: vi.fn(),
    recordPush: vi.fn(() => null),
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

function createDeps(
  trackingGateway: ReturnType<typeof createMockTrackingGateway>,
  overrides: Record<string, unknown> = {},
) {
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
        logger: createStubLogger(),
      }),
    enforceBudget: createAcceptAllEnforceBudget(),
    broadcastBudgetExceeded: vi.fn(),
    getRepositories: vi.fn(() => []),
    removeWorktree,
    recordBypass: new RecordBypassUseCase(trackingGateway),
    noteCommentPostGateway: new StubNoteCommentPostGateway(),
    handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGateway),
    approvalRevocationGateway: new StubApprovalRevocationGateway(),
    getQualityThreshold: (): number | null => null,
    guardDiffSize: new GuardDiffSizeUseCase({
      changedFilesFetchGateway: new StubChangedFilesFetchGateway(),
    }),
    getMaxDiffLines: (): number => 2000,
    now: (): string => '2026-05-26T12:00:00.000Z',
    ...overrides,
  };
}

function requestWith(uuid: string | undefined): FastifyRequest {
  const headers: Record<string, string> = {};
  if (uuid !== undefined) {
    headers['x-gitlab-event-uuid'] = uuid;
  }
  return {
    body: GitLabEventFactory.createWithReviewerAdded('claude-bot'),
    headers,
  } as unknown as FastifyRequest;
}

describe('handleGitLabWebhook idempotency guard', () => {
  let mockReply: FastifyReply;
  let mockGateway: ReturnType<typeof createMockTrackingGateway>;
  const logger = createStubLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    mockGateway = createMockTrackingGateway();
    mockGateway.getById.mockReturnValue(null);
  });

  it('AC4: a duplicate UUID returns 200 no-op with a single invocation and pristine output stubs', async () => {
    const idempotencyStore = new InMemoryIdempotencyStore({ ttlMs: 60_000, clock: () => 0 });
    const gateClaudeInvocation = new StubGateClaudeInvocation();
    const noteCommentPostGateway = new StubNoteCommentPostGateway();
    const approvalRevocationGateway = new StubApprovalRevocationGateway();
    const trackAssignment = new TrackAssignmentUseCase(mockGateway);
    const trackSpy = vi.spyOn(trackAssignment, 'execute');
    const deps = createDeps(mockGateway, {
      idempotencyStore,
      gateClaudeInvocation,
      noteCommentPostGateway,
      approvalRevocationGateway,
      trackAssignment,
    });

    await handleGitLabWebhook(requestWith('uuid-A'), mockReply, logger, deps);

    const trackCallsAfterFirst = trackSpy.mock.calls.length;

    await handleGitLabWebhook(requestWith('uuid-A'), mockReply, logger, deps);

    expect(gateClaudeInvocation.invocationCount).toBe(1);
    expect(trackSpy.mock.calls.length).toBe(trackCallsAfterFirst);
    expect(noteCommentPostGateway.calls).toHaveLength(0);
    expect(approvalRevocationGateway.calls).toHaveLength(0);
    expect(mockReply.status).toHaveBeenLastCalledWith(200);
  });

  it('AC5: two distinct UUIDs each proceed to the chokepoint (two invocations)', async () => {
    const idempotencyStore = new InMemoryIdempotencyStore({ ttlMs: 60_000, clock: () => 0 });
    const gateClaudeInvocation = new StubGateClaudeInvocation();
    const deps = createDeps(mockGateway, { idempotencyStore, gateClaudeInvocation });

    await handleGitLabWebhook(requestWith('uuid-A'), mockReply, logger, deps);
    await handleGitLabWebhook(requestWith('uuid-B'), mockReply, logger, deps);

    expect(gateClaudeInvocation.invocationCount).toBe(2);
  });

  it('AC6: a missing UUID reaches the chokepoint once and records no dedup entry', async () => {
    const idempotencyStore = new StubIdempotencyStore();
    const gateClaudeInvocation = new StubGateClaudeInvocation();
    const deps = createDeps(mockGateway, { idempotencyStore, gateClaudeInvocation });

    await handleGitLabWebhook(requestWith(undefined), mockReply, logger, deps);

    expect(gateClaudeInvocation.invocationCount).toBe(1);
    expect(idempotencyStore.recordedKeys).toHaveLength(0);
    expect(idempotencyStore.entryCount).toBe(0);
    expect(mockReply.status).not.toHaveBeenCalledWith(400);
    expect(mockReply.status).not.toHaveBeenCalledWith(409);
  });
});
