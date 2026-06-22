/**
 * SPEC-180 — Block approval below quality threshold (Iteration C)
 *
 * Outer-loop acceptance test (SDD) for the platform-side revocation + FR
 * explanatory comment on platform approval of a non-qualified merge request
 * without an active bypass.
 *
 * In-scope scenarios from docs/specs/180-quality-threshold-block-approval.md:
 *   6: platform approval on non-qualified MR → unapprove on platform + post
 *      "Approbation annulée : seuil qualité 7/10 non atteint (6/10).
 *       Utilisez `/bypass-quality "raison"` pour forcer."
 *
 * Both platforms (GitLab + GitHub) — the spec rule applies symmetrically.
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

const mockGitHubRepoConfig: RepositoryConfig = {
  name: 'test-project',
  platform: 'github',
  localPath: '/home/user/projects/test-project',
  remoteUrl: 'https://github.com/test-org/test-project.git',
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
  findRepositoryByRemoteUrl: vi.fn(() => mockGitHubRepoConfig),
}));

const gitLabEventTypeRef = { value: 'Merge Request Hook' as string };
const gitHubEventTypeRef = { value: 'pull_request_review' as string };

vi.mock('@/security/verifier.js', () => ({
  verifyGitLabSignature: vi.fn(() => ({ valid: true })),
  verifyGitHubSignature: vi.fn(() => ({ valid: true })),
  getGitLabEventType: vi.fn(() => gitLabEventTypeRef.value),
  getGitHubEventType: vi.fn(() => gitHubEventTypeRef.value),
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

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import { handleGitHubWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import type { GitHubWebhookDependencies } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import { handleGitLabWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import type { GitLabWebhookDependencies } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import {
  processWebhook,
  type ProcessWebhookResult,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubApprovalRevocationGateway } from '@/tests/stubs/approvalRevocation.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const PROJECT_PATH = '/home/user/projects/test-project';
const MR_NUMBER = 42;
const GITLAB_MR_ID = `gitlab-test-org/test-project-${MR_NUMBER}`;
const GITHUB_MR_ID = `github-test-org/test-project-${MR_NUMBER}`;

function buildGitLabApproveEvent(): unknown {
  return {
    object_kind: 'merge_request',
    event_type: 'merge_request',
    user: { username: 'alice', name: 'Alice' },
    project: {
      id: 1,
      name: 'test-project',
      path_with_namespace: 'test-org/test-project',
      web_url: 'https://gitlab.com/test-org/test-project',
      git_http_url: 'https://gitlab.com/test-org/test-project.git',
    },
    object_attributes: {
      iid: MR_NUMBER,
      title: 'Test MR',
      state: 'opened',
      action: 'approved',
      source_branch: 'feature/test',
      target_branch: 'main',
      url: `https://gitlab.com/test-org/test-project/-/merge_requests/${MR_NUMBER}`,
      draft: false,
    },
  };
}

function buildGitHubPullRequestReviewEvent(): unknown {
  return {
    action: 'submitted',
    review: {
      id: 12345,
      state: 'approved',
      user: { login: 'alice' },
    },
    pull_request: {
      number: MR_NUMBER,
      state: 'open',
      html_url: `https://github.com/test-org/test-project/pull/${MR_NUMBER}`,
    },
    repository: {
      full_name: 'test-org/test-project',
      html_url: 'https://github.com/test-org/test-project',
      clone_url: 'https://github.com/test-org/test-project.git',
    },
    sender: { login: 'alice' },
  };
}

function buildApproveProcessWebhook(
  tracking: InMemoryReviewRequestTrackingGateway,
): (event: WebhookEvent) => Promise<ProcessWebhookResult> {
  return (event: WebhookEvent): Promise<ProcessWebhookResult> =>
    processWebhook(event, {
      handleClose: async () => ({
        status: 'cleaned',
        jobCancelled: false,
        trackingArchived: false,
        contextDeleted: false,
      }),
      transitionState: new TransitionStateUseCase(tracking),
      recordPush: new RecordPushUseCase(tracking),
      checkFollowupNeeded: new CheckFollowupNeededUseCase(tracking),
      removeWorktree: async () => ({ status: 'removed' }),
      handlePlatformApproval: new HandlePlatformApprovalUseCase(tracking),
      getQualityThreshold: () => 7,
      logger: createStubLogger(),
    });
}

function buildGitLabDeps(
  tracking: InMemoryReviewRequestTrackingGateway,
  noteCommentPost: StubNoteCommentPostGateway,
  approvalRevocation: StubApprovalRevocationGateway,
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
    processWebhook: buildApproveProcessWebhook(tracking),
    checkFollowupNeeded: new CheckFollowupNeededUseCase(tracking),
    syncThreads: new SyncThreadsUseCase(tracking, threadFetchGateway),
    recordBypass: new RecordBypassUseCase(tracking),
    noteCommentPostGateway: noteCommentPost,
    handlePlatformApproval: new HandlePlatformApprovalUseCase(tracking),
    approvalRevocationGateway: approvalRevocation,
    getQualityThreshold: () => 7,
    guardDiffSize: { execute: () => ({ kind: 'allowed' }) },
    getMaxDiffLines: () => 2000,
    now: () => '2026-05-26T12:00:00.000Z',
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

function buildGitHubDeps(
  tracking: InMemoryReviewRequestTrackingGateway,
  noteCommentPost: StubNoteCommentPostGateway,
  approvalRevocation: StubApprovalRevocationGateway,
): GitHubWebhookDependencies {
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
    processWebhook: buildApproveProcessWebhook(tracking),
    checkFollowupNeeded: new CheckFollowupNeededUseCase(tracking),
    syncThreads: new SyncThreadsUseCase(tracking, threadFetchGateway),
    recordBypass: new RecordBypassUseCase(tracking),
    noteCommentPostGateway: noteCommentPost,
    handlePlatformApproval: new HandlePlatformApprovalUseCase(tracking),
    approvalRevocationGateway: approvalRevocation,
    getQualityThreshold: () => 7,
    guardDiffSize: { execute: () => ({ kind: 'allowed' }) },
    getMaxDiffLines: () => 2000,
    now: () => '2026-05-26T12:00:00.000Z',
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
    getRepositories: vi.fn(() => [mockGitHubRepoConfig]),
    removeWorktree: vi.fn(async () => ({ status: 'removed' as const })),
  } as unknown as GitHubWebhookDependencies;
}

describe('Acceptance — SPEC-180 Iteration C: Platform approval revoked on non-qualified MR', () => {
  let tracking: InMemoryReviewRequestTrackingGateway;
  let noteCommentPost: StubNoteCommentPostGateway;
  let approvalRevocation: StubApprovalRevocationGateway;
  let mockReply: FastifyReply;
  const logger = createStubLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    tracking = new InMemoryReviewRequestTrackingGateway();
    noteCommentPost = new StubNoteCommentPostGateway();
    approvalRevocation = new StubApprovalRevocationGateway();
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    gitLabEventTypeRef.value = 'Merge Request Hook';
    gitHubEventTypeRef.value = 'pull_request_review';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rule: platform approval on non-qualified MR is revoked with FR explanation', () => {
    it('scenario 6 (GitLab) — approved event below threshold revokes approval and posts FR comment', async () => {
      tracking.create(
        PROJECT_PATH,
        TrackedMrFactory.create({
          id: GITLAB_MR_ID,
          mrNumber: MR_NUMBER,
          platform: 'gitlab',
          project: 'test-org/test-project',
          state: 'pending-approval',
          latestScore: 6,
          openThreads: 0,
          bypass: null,
        }),
      );

      const deps = buildGitLabDeps(tracking, noteCommentPost, approvalRevocation);
      const request = {
        body: buildGitLabApproveEvent(),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, deps);

      expect(approvalRevocation.calls).toHaveLength(1);
      expect(approvalRevocation.calls[0]).toMatchObject({
        projectPath: 'test-org/test-project',
        mrNumber: MR_NUMBER,
      });

      expect(noteCommentPost.calls).toHaveLength(1);
      expect(noteCommentPost.calls[0]).toEqual({
        projectPath: 'test-org/test-project',
        mrNumber: MR_NUMBER,
        body: 'Approbation annulée : seuil qualité 7/10 non atteint (6/10). Utilisez `/bypass-quality "raison"` pour forcer.',
      });

      const finalMr = tracking.getById(PROJECT_PATH, GITLAB_MR_ID);
      expect(finalMr?.state).toBe('pending-approval');
    });

    it('scenario 6 (GitHub) — pull_request_review approved below threshold revokes review and posts FR comment', async () => {
      tracking.create(
        PROJECT_PATH,
        TrackedMrFactory.create({
          id: GITHUB_MR_ID,
          mrNumber: MR_NUMBER,
          platform: 'github',
          project: 'test-org/test-project',
          state: 'pending-approval',
          latestScore: 6,
          openThreads: 0,
          bypass: null,
        }),
      );

      const deps = buildGitHubDeps(tracking, noteCommentPost, approvalRevocation);
      const request = {
        body: buildGitHubPullRequestReviewEvent(),
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, deps);

      expect(approvalRevocation.calls).toHaveLength(1);
      expect(approvalRevocation.calls[0]).toMatchObject({
        projectPath: 'test-org/test-project',
        mrNumber: MR_NUMBER,
        reviewId: 12345,
      });

      expect(noteCommentPost.calls).toHaveLength(1);
      expect(noteCommentPost.calls[0]).toEqual({
        projectPath: 'test-org/test-project',
        mrNumber: MR_NUMBER,
        body: 'Approbation annulée : seuil qualité 7/10 non atteint (6/10). Utilisez `/bypass-quality "raison"` pour forcer.',
      });

      const finalMr = tracking.getById(PROJECT_PATH, GITHUB_MR_ID);
      expect(finalMr?.state).toBe('pending-approval');
    });
  });
});
