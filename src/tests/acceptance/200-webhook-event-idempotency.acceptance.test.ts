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

import { handleGitLabWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { InMemoryIdempotencyStore } from '@/modules/platform-integration/interface-adapters/gateways/inMemoryIdempotencyStore.gateway.js';
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

describe('Acceptance — SPEC-200: Webhook event idempotency and replay protection', () => {
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

  describe('Rule: a redelivered event is acted upon at most once within the TTL window', () => {
    it('answers the duplicate with HTTP 200 no-op, a single invocation and pristine output gateways', async () => {
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

      await handleGitLabWebhook(requestWith('event-uuid-A'), mockReply, logger, mockGateway, deps);
      const trackCallsAfterFirst = trackSpy.mock.calls.length;

      await handleGitLabWebhook(requestWith('event-uuid-A'), mockReply, logger, mockGateway, deps);

      expect(gateClaudeInvocation.invocationCount).toBe(1);
      expect(trackSpy.mock.calls.length).toBe(trackCallsAfterFirst);
      expect(noteCommentPostGateway.calls).toHaveLength(0);
      expect(approvalRevocationGateway.calls).toHaveLength(0);
      expect(mockReply.status).toHaveBeenLastCalledWith(200);
    });
  });

  describe('Rule: distinct events are independent', () => {
    it('lets two different UUIDs each reach the invocation chokepoint', async () => {
      const idempotencyStore = new InMemoryIdempotencyStore({ ttlMs: 60_000, clock: () => 0 });
      const gateClaudeInvocation = new StubGateClaudeInvocation();
      const deps = createDeps(mockGateway, { idempotencyStore, gateClaudeInvocation });

      await handleGitLabWebhook(requestWith('event-uuid-A'), mockReply, logger, mockGateway, deps);
      await handleGitLabWebhook(requestWith('event-uuid-B'), mockReply, logger, mockGateway, deps);

      expect(gateClaudeInvocation.invocationCount).toBe(2);
    });
  });

  describe('Rule: a missing event UUID degrades to gated, never hard-rejects', () => {
    it('reaches the chokepoint once, records no dedup entry and exposes no rejection branch', async () => {
      const idempotencyStore = new StubIdempotencyStore();
      const gateClaudeInvocation = new StubGateClaudeInvocation();
      const deps = createDeps(mockGateway, { idempotencyStore, gateClaudeInvocation });

      await handleGitLabWebhook(requestWith(undefined), mockReply, logger, mockGateway, deps);

      expect(gateClaudeInvocation.invocationCount).toBe(1);
      expect(idempotencyStore.recordedKeys).toHaveLength(0);
      expect(idempotencyStore.entryCount).toBe(0);
      expect(mockReply.status).not.toHaveBeenCalledWith(400);
      expect(mockReply.status).not.toHaveBeenCalledWith(409);
    });
  });

  describe('Rule: an event redelivered after the TTL window is reprocessed', () => {
    it('re-accepts the same UUID once the clock advances beyond the TTL', async () => {
      let currentTimeMs = 0;
      const idempotencyStore = new InMemoryIdempotencyStore({
        ttlMs: 60_000,
        clock: () => currentTimeMs,
      });
      const gateClaudeInvocation = new StubGateClaudeInvocation();
      const deps = createDeps(mockGateway, { idempotencyStore, gateClaudeInvocation });

      await handleGitLabWebhook(requestWith('event-uuid-A'), mockReply, logger, mockGateway, deps);
      await handleGitLabWebhook(requestWith('event-uuid-A'), mockReply, logger, mockGateway, deps);

      expect(gateClaudeInvocation.invocationCount).toBe(1);

      currentTimeMs = 60_001;
      await handleGitLabWebhook(requestWith('event-uuid-A'), mockReply, logger, mockGateway, deps);

      expect(gateClaudeInvocation.invocationCount).toBe(2);
    });
  });
});
