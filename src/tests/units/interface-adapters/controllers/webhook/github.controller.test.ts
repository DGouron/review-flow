import { vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGitHubWebhook } from '../../../../../interface-adapters/controllers/webhook/github.controller.js';
import { GitHubEventFactory } from '../../../../factories/gitHubEvent.factory.js';
import { createStubLogger } from '../../../../stubs/logger.stub.js';
import { enqueueReview } from '../../../../../frameworks/queue/pQueueAdapter.js';
import { invokeClaudeReview } from '../../../../../claude/invoker.js';
import { TrackedMrFactory } from '../../../../factories/trackedMr.factory.js';
import type { TrackedMr } from '../../../../../entities/tracking/trackedMr.js';

function createMockTrackingGateway() {
  const basicMr = TrackedMrFactory.create({
    id: 'github-test-owner/test-repo-123',
    mrNumber: 123,
    platform: 'github',
    project: 'test-owner/test-repo',
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

describe('handleGitHubWebhook', () => {
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
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('PR tracking on review request', () => {
    it('should track PR assignment when review is requested', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          mrNumber: 123,
          title: 'Test PR',
          url: 'https://github.com/test-owner/test-repo/pull/123',
          project: 'test-owner/test-repo',
          platform: 'github',
          sourceBranch: 'feature/test',
          targetBranch: 'main',
          assignment: expect.objectContaining({
            username: 'developer',
          }),
        })
      );
    });

    it('should track PR assignment when labeled with needs-review', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitHubEventFactory.createLabeledPr('needs-review');
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          mrNumber: 123,
          platform: 'github',
        })
      );
    });
  });

  describe('review completion callback', () => {
    it('should record review stats after successful review', async () => {
      const mockResult = {
        success: true,
        cancelled: false,
        stdout: '[REVIEW_STATS:blocking=2:warnings=3:suggestions=1:score=7.5]',
        durationMs: 120000,
        exitCode: 0,
        stderr: '',
      };

      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      vi.mocked(invokeClaudeReview).mockResolvedValue(mockResult);

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.recordReviewEvent).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        'github-test-owner/test-repo-123',
        expect.objectContaining({
          type: 'review',
          score: 7.5,
          blocking: 2,
          warnings: 3,
          suggestions: 1,
        })
      );
    });

    it('should count only blocking issues as open threads, not warnings', async () => {
      const mockResult = {
        success: true,
        cancelled: false,
        stdout: '[REVIEW_STATS:blocking=1:warnings=5:suggestions=2:score=6]',
        durationMs: 90000,
        exitCode: 0,
        stderr: '',
      };

      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      vi.mocked(invokeClaudeReview).mockResolvedValue(mockResult);

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.update).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        'github-test-owner/test-repo-123',
        expect.objectContaining({
          openThreads: 1, // Only blocking count, not blocking + warnings (6)
        })
      );
    });

    it('should not record stats when review is cancelled', async () => {
      const mockResult = {
        success: false,
        cancelled: true,
        stdout: '',
        durationMs: 5000,
        exitCode: 1,
        stderr: '',
      };

      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      vi.mocked(invokeClaudeReview).mockResolvedValue(mockResult);

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.recordReviewEvent).not.toHaveBeenCalled();
    });

    it('should not record stats when review fails', async () => {
      const mockResult = {
        success: false,
        cancelled: false,
        stdout: 'Error occurred',
        durationMs: 10000,
        exitCode: 1,
        stderr: '',
      };

      vi.mocked(enqueueReview).mockImplementation(async (job, callback) => {
        await callback(job, new AbortController().signal);
        return true;
      });

      vi.mocked(invokeClaudeReview).mockResolvedValue(mockResult);

      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.recordReviewEvent).not.toHaveBeenCalled();
    });
  });

  describe('assignedBy attribution', () => {
    it('should use PR assignee as assignedBy when assignee is present', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      event.pull_request.assignees = [{ login: 'pr-owner' }];
      event.sender = { login: 'reviewer-who-requested' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'pr-owner',
            displayName: 'pr-owner',
          }),
        })
      );
    });

    it('should fallback to sender when no assignee is present', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      event.pull_request.assignees = [];
      event.sender = { login: 'webhook-sender' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'webhook-sender',
            displayName: 'webhook-sender',
          }),
        })
      );
    });

    it('should use first assignee when multiple assignees exist', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      event.pull_request.assignees = [
        { login: 'primary-owner' },
        { login: 'secondary-owner' },
      ];
      event.sender = { login: 'reviewer' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'primary-owner',
            displayName: 'primary-owner',
          }),
        })
      );
    });

    it('should fallback to sender when assignees field is undefined', async () => {
      mockGateway.getById.mockReturnValue(null);
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      (event.pull_request as Record<string, unknown>).assignees = undefined;
      event.sender = { login: 'fallback-sender' };

      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'fallback-sender',
            displayName: 'fallback-sender',
          }),
        })
      );
    });
  });
});
