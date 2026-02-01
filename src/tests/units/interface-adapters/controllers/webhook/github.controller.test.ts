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

vi.mock('../../../../../queue/reviewQueue.js', () => ({
  createJobId: vi.fn(() => 'github-test-owner/test-repo-123'),
  enqueueReview: vi.fn(() => Promise.resolve(true)),
  updateJobProgress: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock('../../../../../services/mrTrackingService.js', () => ({
  trackMrAssignment: vi.fn(),
  recordReviewCompletion: vi.fn(),
  archiveMr: vi.fn(),
}));

vi.mock('../../../../../claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(),
  sendNotification: vi.fn(),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGitHubWebhook } from '../../../../../interface-adapters/controllers/webhook/github.controller.js';
import { GitHubEventFactory } from '../../../../factories/gitHubEvent.factory.js';
import { createStubLogger } from '../../../../stubs/logger.stub.js';
import * as mrTrackingService from '../../../../../services/mrTrackingService.js';
import { enqueueReview } from '../../../../../queue/reviewQueue.js';
import { invokeClaudeReview } from '../../../../../claude/invoker.js';

describe('handleGitHubWebhook', () => {
  let mockReply: FastifyReply;

  const logger = createStubLogger();

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

  describe('PR tracking on review request', () => {
    it('should track PR assignment when review is requested', async () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-bot');
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger);

      expect(mrTrackingService.trackMrAssignment).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          mrNumber: 123,
          title: 'Test PR',
          url: 'https://github.com/test-owner/test-repo/pull/123',
          project: 'test-owner/test-repo',
          platform: 'github',
          sourceBranch: 'feature/test',
          targetBranch: 'main',
        }),
        expect.objectContaining({
          username: 'developer',
        })
      );
    });

    it('should track PR assignment when labeled with needs-review', async () => {
      const event = GitHubEventFactory.createLabeledPr('needs-review');
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger);

      expect(mrTrackingService.trackMrAssignment).toHaveBeenCalledWith(
        '/home/user/projects/test-repo',
        expect.objectContaining({
          mrNumber: 123,
          platform: 'github',
        }),
        expect.any(Object)
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

      await handleGitHubWebhook(request, mockReply, logger);

      expect(mrTrackingService.recordReviewCompletion).toHaveBeenCalledWith(
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

      await handleGitHubWebhook(request, mockReply, logger);

      expect(mrTrackingService.recordReviewCompletion).not.toHaveBeenCalled();
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

      await handleGitHubWebhook(request, mockReply, logger);

      expect(mrTrackingService.recordReviewCompletion).not.toHaveBeenCalled();
    });
  });
});
