import { describe, it, expect } from 'vitest';

import { gitHubPullRequestEventGuard } from '@/modules/platform-integration/entities/github/githubPullRequestEvent.guard.js';

import { GitHubEventFactory } from '../../../factories/gitHubEvent.factory.js';

describe('gitHubPullRequestEventGuard', () => {
  describe('safeParse', () => {
    it('should return success for valid review_requested payload', () => {
      const validPayload = GitHubEventFactory.createReviewRequestedPr('claude-bot');

      const result = gitHubPullRequestEventGuard.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('review_requested');
        expect(result.data.pull_request.number).toBe(123);
      }
    });

    it('should return failure for invalid payload', () => {
      const invalidPayload = { action: 'opened' };

      const result = gitHubPullRequestEventGuard.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should return success for payload with assignees', () => {
      const payloadWithAssignees = GitHubEventFactory.createPullRequestEvent();
      payloadWithAssignees.pull_request.assignees = [
        { login: 'pr-owner' },
        { login: 'co-assignee' },
      ];

      const result = gitHubPullRequestEventGuard.safeParse(payloadWithAssignees);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pull_request.assignees).toHaveLength(2);
        expect(result.data.pull_request.assignees?.[0].login).toBe('pr-owner');
      }
    });

    it('should return success for payload with empty assignees array', () => {
      const payloadWithEmptyAssignees = GitHubEventFactory.createPullRequestEvent();
      payloadWithEmptyAssignees.pull_request.assignees = [];

      const result = gitHubPullRequestEventGuard.safeParse(payloadWithEmptyAssignees);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pull_request.assignees).toEqual([]);
      }
    });

    it('should return success for payload without assignees field', () => {
      const payloadWithoutAssignees = GitHubEventFactory.createPullRequestEvent();
      (payloadWithoutAssignees.pull_request as Record<string, unknown>).assignees = undefined;

      const result = gitHubPullRequestEventGuard.safeParse(payloadWithoutAssignees);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pull_request.assignees).toBeUndefined();
      }
    });

    it('should parse payload with head.repo and base.repo for cross-fork detection', () => {
      const payload = GitHubEventFactory.createPullRequestEvent();
      (payload.pull_request.head as Record<string, unknown>).repo = {
        full_name: 'contributor/test-repo',
        clone_url: 'https://github.com/contributor/test-repo.git',
      };
      (payload.pull_request.base as Record<string, unknown>).repo = {
        full_name: 'test-owner/test-repo',
      };

      const result = gitHubPullRequestEventGuard.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pull_request.head.repo?.full_name).toBe('contributor/test-repo');
        expect(result.data.pull_request.head.repo?.clone_url).toBe(
          'https://github.com/contributor/test-repo.git',
        );
        expect(result.data.pull_request.base.repo?.full_name).toBe('test-owner/test-repo');
      }
    });

    it('should parse payload without head.repo and base.repo (backwards compatible)', () => {
      const payload = GitHubEventFactory.createPullRequestEvent();

      const result = gitHubPullRequestEventGuard.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pull_request.head.repo).toBeUndefined();
        expect(result.data.pull_request.base.repo).toBeUndefined();
      }
    });
  });
});
