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
};

const mockRepoConfig: RepositoryConfig = {
  name: 'test-project',
  platform: 'gitlab',
  localPath: '/home/user/projects/test-project',
  remoteUrl: 'https://gitlab.com/test-org/test-project.git',
  skill: 'review-front',
  enabled: true,
};

vi.mock('../../../../../config/loader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  findRepositoryByProjectPath: vi.fn(() => mockRepoConfig),
}));

vi.mock('../../../../../security/verifier.js', () => ({
  verifyGitLabSignature: vi.fn(() => ({ valid: true })),
  getGitLabEventType: vi.fn(() => 'Merge Request Hook'),
}));

vi.mock('../../../../../frameworks/queue/pQueueAdapter.js', () => ({
  createJobId: vi.fn(() => 'gitlab-test-org/test-project-42'),
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

vi.mock('../../../../../config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getProjectAgents: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
}));

vi.mock('../../../../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js', () => ({
  ReviewContextFileSystemGateway: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    read: vi.fn(() => null),
    delete: vi.fn(() => ({ deleted: true })),
    updateProgress: vi.fn(),
  })),
}));

vi.mock('../../../../../../interface-adapters/gateways/threadFetch.gitlab.gateway.js', () => ({
  GitLabThreadFetchGateway: vi.fn().mockImplementation(() => ({
    fetchThreads: vi.fn(() => []),
  })),
  defaultGitLabExecutor: vi.fn(),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGitLabWebhook } from '../../../../../interface-adapters/controllers/webhook/gitlab.controller.js';
import { GitLabEventFactory } from '../../../../factories/gitLabEvent.factory.js';
import { createStubLogger } from '../../../../stubs/logger.stub.js';
import { TrackedMrFactory } from '../../../../factories/trackedMr.factory.js';
import type { TrackedMr } from '../../../../../entities/tracking/trackedMr.js';

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

describe('handleGitLabWebhook', () => {
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

  describe('when MR is merged', () => {
    it('should transition state to merged via gateway', async () => {
      const event = GitLabEventFactory.createMergedMr();
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.update).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        'gitlab-test-org/test-project-42',
        expect.objectContaining({ state: 'merged' })
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'merged' })
      );
    });
  });

  describe('when MR is approved', () => {
    it('should transition state to approved via gateway', async () => {
      const event = GitLabEventFactory.createApprovedMr();
      const request = {
        body: event,
        headers: {},
      } as unknown as FastifyRequest;

      await handleGitLabWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.update).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        'gitlab-test-org/test-project-42',
        expect.objectContaining({ state: 'approved' })
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' })
      );
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

      await handleGitLabWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'mr-owner',
            displayName: 'MR Owner',
          }),
        })
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

      await handleGitLabWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'webhook-trigger',
            displayName: 'Webhook Trigger',
          }),
        })
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

      await handleGitLabWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'primary-owner',
            displayName: 'Primary Owner',
          }),
        })
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

      await handleGitLabWebhook(request, mockReply, logger, mockGateway);

      expect(mockGateway.create).toHaveBeenCalledWith(
        '/home/user/projects/test-project',
        expect.objectContaining({
          assignment: expect.objectContaining({
            username: 'fallback-user',
            displayName: 'Fallback User',
          }),
        })
      );
    });
  });
});
