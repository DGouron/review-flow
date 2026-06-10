/**
 * SPEC-180 — Block approval below quality threshold (Iteration B)
 *
 * Outer-loop acceptance test (SDD) for the comment-based bypass mechanism.
 * Exercises POST /webhooks/gitlab with X-Gitlab-Event: Note Hook events and
 * the chained recordReviewCompletion → bypass-reset path.
 *
 * In-scope scenarios from docs/specs/180-quality-threshold-block-approval.md:
 *   4: bypass with reason → state transition to approved allowed + bypass recorded
 *   5: bypass without reason → reject with FR message + no bypass stored + FR comment posted
 *   9: new review after bypass → bypass cleared + state re-evaluated under normal gate
 *  10: bypass on already-qualified MR → bypass recorded + no state change
 *
 * Out of scope: scenario 6 (platform unapprove on platform-side approval — iter C).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { vi } from 'vitest';

import type { RepositoryConfig } from '@/config/loader.js';

const mockRepoConfig: RepositoryConfig = {
  name: 'test-project',
  platform: 'gitlab',
  localPath: '/home/user/projects/test-project',
  remoteUrl: 'https://gitlab.com/test-org/test-project.git',
  skill: 'review-front',
  enabled: true,
};

const mockConfig = {
  server: { port: 3000 },
  user: { gitlabUsername: 'claude-bot', githubUsername: 'claude-bot' },
  queue: { maxConcurrent: 1, deduplicationWindowMs: 60000 },
  repositories: [mockRepoConfig],
};

vi.mock('@/config/loader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  findRepositoryByProjectPath: vi.fn(() => mockRepoConfig),
  findRepositoryByRemoteUrl: vi.fn(() => mockRepoConfig),
}));

vi.mock('@/security/verifier.js', () => ({
  verifyGitLabSignature: vi.fn(() => ({ valid: true })),
  getGitLabEventType: vi.fn(() => 'Note Hook'),
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
  loadProjectConfig: vi.fn(() => ({ qualityThreshold: 7 })),
  getProjectAgents: vi.fn(() => null),
  getProjectAgentsOrFocusDefaults: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
  getProjectLanguage: vi.fn(() => 'en'),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { handleGitLabWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import type { GitLabWebhookDependencies } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const PROJECT_PATH = '/home/user/projects/test-project';
const MR_NUMBER = 42;
const MR_ID = `gitlab-test-org/test-project-${MR_NUMBER}`;

function buildNoteEvent(noteBody: string, authorUsername = 'alice'): unknown {
  return {
    object_kind: 'note',
    event_type: 'note',
    user: { username: authorUsername, name: authorUsername },
    project: {
      id: 1,
      name: 'test-project',
      path_with_namespace: 'test-org/test-project',
      web_url: 'https://gitlab.com/test-org/test-project',
      git_http_url: 'https://gitlab.com/test-org/test-project.git',
    },
    object_attributes: {
      id: 999,
      note: noteBody,
      noteable_type: 'MergeRequest',
      noteable_id: MR_NUMBER,
    },
    merge_request: {
      iid: MR_NUMBER,
      title: 'Test MR',
      state: 'opened',
      source_branch: 'feature/test',
      target_branch: 'main',
      url: `https://gitlab.com/test-org/test-project/-/merge_requests/${MR_NUMBER}`,
    },
  };
}

function createDeterministicNow(): () => string {
  return () => '2026-05-26T12:00:00.000Z';
}

function buildDeps(
  tracking: InMemoryReviewRequestTrackingGateway,
  noteCommentPost: StubNoteCommentPostGateway,
): GitLabWebhookDependencies {
  const threadFetchGateway = { fetchThreads: vi.fn(() => []) };
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
    diffMetadataFetchGateway: { fetchDiffMetadata: vi.fn(() => undefined) },
    diffStatsFetchGateway: { fetchDiffStats: vi.fn(() => null) },
    trackAssignment: new TrackAssignmentUseCase(tracking),
    recordCompletion: new RecordReviewCompletionUseCase(tracking),
    recordPush: new RecordPushUseCase(tracking),
    transitionState: new TransitionStateUseCase(tracking),
    checkFollowupNeeded: new CheckFollowupNeededUseCase(tracking),
    syncThreads: new SyncThreadsUseCase(tracking, threadFetchGateway),
    recordBypass: new RecordBypassUseCase(tracking),
    noteCommentPostGateway: noteCommentPost,
    now: createDeterministicNow(),
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
    getRepositories: vi.fn(() => [mockRepoConfig]),
    removeWorktree: vi.fn(async () => ({ status: 'removed' as const })),
  } as unknown as GitLabWebhookDependencies;
}

describe('Acceptance — SPEC-180 Iteration B: Comment-based bypass', () => {
  let tracking: InMemoryReviewRequestTrackingGateway;
  let noteCommentPost: StubNoteCommentPostGateway;
  let deps: GitLabWebhookDependencies;
  let mockReply: FastifyReply;
  const logger = createStubLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    tracking = new InMemoryReviewRequestTrackingGateway();
    noteCommentPost = new StubNoteCommentPostGateway();
    deps = buildDeps(tracking, noteCommentPost);
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rule: bypass with reason overrides the quality gate', () => {
    it('scenario 4 — bypass marker with reason allows approval despite failing gate', async () => {
      tracking.create(
        PROJECT_PATH,
        TrackedMrFactory.create({
          id: MR_ID,
          mrNumber: MR_NUMBER,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-approval',
          latestScore: 5,
          openThreads: 1,
        }),
      );

      const noteBody = '/bypass-quality "hotfix critique"';
      const request = {
        body: buildNoteEvent(noteBody),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, tracking, deps);

      const afterBypass = tracking.getById(PROJECT_PATH, MR_ID);
      expect(afterBypass?.bypass).toEqual({
        author: 'alice',
        reason: 'hotfix critique',
        recordedAt: '2026-05-26T12:00:00.000Z',
      });

      const transitionResult = deps.transitionState.execute({
        projectPath: PROJECT_PATH,
        mrId: MR_ID,
        targetState: 'approved',
        qualityCheck: (mr) =>
          evaluateQualityGate({
            latestScore: mr.latestScore,
            blockingIssues: mr.openThreads,
            threshold: 7,
          }),
      });
      expect(transitionResult.ok).toBe(true);

      const final = tracking.getById(PROJECT_PATH, MR_ID);
      expect(final?.state).toBe('approved');
    });
  });

  describe('Rule: bypass without reason is rejected with a French message', () => {
    it('scenario 5 — bypass marker without reason posts FR comment and does not store bypass', async () => {
      tracking.create(
        PROJECT_PATH,
        TrackedMrFactory.create({
          id: MR_ID,
          mrNumber: MR_NUMBER,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-approval',
          latestScore: 5,
          openThreads: 0,
        }),
      );

      const request = {
        body: buildNoteEvent('/bypass-quality'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, tracking, deps);

      expect(noteCommentPost.calls).toHaveLength(1);
      expect(noteCommentPost.calls[0]).toEqual({
        projectPath: 'test-org/test-project',
        mrNumber: MR_NUMBER,
        body: 'Le bypass nécessite une raison explicite. Format attendu : /bypass-quality "raison"',
      });

      const updated = tracking.getById(PROJECT_PATH, MR_ID);
      expect(updated?.bypass).toBeNull();
    });
  });

  describe('Rule: a new review resets any active bypass', () => {
    it('scenario 9 — new completed review clears bypass and re-evaluates state', () => {
      tracking.create(
        PROJECT_PATH,
        TrackedMrFactory.create({
          id: MR_ID,
          mrNumber: MR_NUMBER,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-approval',
          latestScore: 5,
          openThreads: 0,
          bypass: {
            author: 'alice',
            reason: 'hotfix critique',
            recordedAt: '2026-05-25T08:00:00.000Z',
          },
        }),
      );

      const recordCompletion = new RecordReviewCompletionUseCase(tracking);
      const result = recordCompletion.execute({
        projectPath: PROJECT_PATH,
        mrId: MR_ID,
        reviewData: {
          type: 'review',
          durationMs: 30000,
          score: 8,
          blocking: 0,
          warnings: 0,
          suggestions: 0,
          threadsOpened: 0,
          threadsClosed: 0,
        },
        qualityThreshold: 7,
      });

      expect(result?.bypass).toBeNull();
      expect(result?.state).toBe('pending-approval');
    });
  });

  describe('Rule: bypass on an already-qualified MR is recorded without state change', () => {
    it('scenario 10 — valid bypass stored, state untouched', async () => {
      tracking.create(
        PROJECT_PATH,
        TrackedMrFactory.create({
          id: MR_ID,
          mrNumber: MR_NUMBER,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-approval',
          latestScore: 9,
          openThreads: 0,
        }),
      );

      const request = {
        body: buildNoteEvent('/bypass-quality "par précaution"'),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, tracking, deps);

      const updated = tracking.getById(PROJECT_PATH, MR_ID);
      expect(updated?.bypass).toEqual({
        author: 'alice',
        reason: 'par précaution',
        recordedAt: '2026-05-26T12:00:00.000Z',
      });
      expect(updated?.state).toBe('pending-approval');
      expect(noteCommentPost.calls).toHaveLength(0);
    });
  });
});
