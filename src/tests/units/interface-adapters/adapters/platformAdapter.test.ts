import { describe, it, expect } from 'vitest';
import { PlatformAdapter } from '../../../../interface-adapters/adapters/platformAdapter.js';
import { GitLabEventFactory, GitHubEventFactory } from '../../../factories/webhookEvent.factory.js';

describe('PlatformAdapter', () => {
  const adapter = new PlatformAdapter();

  describe('translateGitLabEvent', () => {
    it('should translate MergeRequest to ReviewRequest', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          iid: 42,
          title: 'feat: add feature',
          description: 'Description',
          state: 'opened',
          action: 'update',
          source_branch: 'feature/x',
          target_branch: 'main',
          url: 'https://gitlab.com/org/project/-/merge_requests/42',
          draft: false,
        },
      });

      const result = adapter.translateGitLabEvent(event);

      expect(result.platform).toBe('gitlab');
      expect(result.reviewRequestNumber).toBe(42);
      expect(result.title).toBe('feat: add feature');
      expect(result.sourceBranch).toBe('feature/x');
      expect(result.targetBranch).toBe('main');
      expect(result.state).toBe('open');
    });

    it('should map opened state to open', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          iid: 1,
          title: 'Test',
          state: 'opened',
          action: 'open',
          source_branch: 'test',
          target_branch: 'main',
          url: 'https://gitlab.com/test',
        },
      });

      const result = adapter.translateGitLabEvent(event);

      expect(result.state).toBe('open');
    });

    it('should map merged state to merged', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          iid: 1,
          title: 'Test',
          state: 'merged',
          action: 'merge',
          source_branch: 'test',
          target_branch: 'main',
          url: 'https://gitlab.com/test',
        },
      });

      const result = adapter.translateGitLabEvent(event);

      expect(result.state).toBe('merged');
    });

    it('should map closed state to closed', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          iid: 1,
          title: 'Test',
          state: 'closed',
          action: 'close',
          source_branch: 'test',
          target_branch: 'main',
          url: 'https://gitlab.com/test',
        },
      });

      const result = adapter.translateGitLabEvent(event);

      expect(result.state).toBe('closed');
    });

    it('should extract first reviewer as assignedReviewer', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        reviewers: [
          { username: 'reviewer1', name: 'Reviewer 1' },
          { username: 'reviewer2', name: 'Reviewer 2' },
        ],
      });

      const result = adapter.translateGitLabEvent(event);

      expect(result.assignedReviewer).toBe('reviewer1');
    });

    it('should handle draft MRs', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          iid: 1,
          title: 'Draft: WIP',
          state: 'opened',
          action: 'update',
          source_branch: 'wip',
          target_branch: 'main',
          url: 'https://gitlab.com/test',
          draft: true,
        },
      });

      const result = adapter.translateGitLabEvent(event);

      expect(result.isDraft).toBe(true);
    });
  });

  describe('translateGitHubEvent', () => {
    it('should translate PullRequest to ReviewRequest', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        pull_request: {
          number: 123,
          title: 'fix: bug fix',
          body: 'Fixes bug',
          state: 'open',
          draft: false,
          html_url: 'https://github.com/org/project/pull/123',
          head: { ref: 'fix/bug' },
          base: { ref: 'main' },
          requested_reviewers: [],
        },
      });

      const result = adapter.translateGitHubEvent(event);

      expect(result.platform).toBe('github');
      expect(result.reviewRequestNumber).toBe(123);
      expect(result.title).toBe('fix: bug fix');
      expect(result.sourceBranch).toBe('fix/bug');
      expect(result.targetBranch).toBe('main');
      expect(result.state).toBe('open');
    });

    it('should map closed state to closed', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        pull_request: {
          number: 1,
          title: 'Test',
          state: 'closed',
          draft: false,
          html_url: 'https://github.com/test',
          head: { ref: 'test' },
          base: { ref: 'main' },
          requested_reviewers: [],
        },
      });

      const result = adapter.translateGitHubEvent(event);

      expect(result.state).toBe('closed');
    });

    it('should extract requested_reviewer as assignedReviewer', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        requested_reviewer: { login: 'claude' },
      });

      const result = adapter.translateGitHubEvent(event);

      expect(result.assignedReviewer).toBe('claude');
    });

    it('should fall back to first requested_reviewers', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        pull_request: {
          number: 1,
          title: 'Test',
          state: 'open',
          draft: false,
          html_url: 'https://github.com/test',
          head: { ref: 'test' },
          base: { ref: 'main' },
          requested_reviewers: [{ login: 'fallback-reviewer' }],
        },
      });

      const result = adapter.translateGitHubEvent(event);

      expect(result.assignedReviewer).toBe('fallback-reviewer');
    });

    it('should handle draft PRs', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        pull_request: {
          number: 1,
          title: 'Draft PR',
          state: 'open',
          draft: true,
          html_url: 'https://github.com/test',
          head: { ref: 'wip' },
          base: { ref: 'main' },
          requested_reviewers: [],
        },
      });

      const result = adapter.translateGitHubEvent(event);

      expect(result.isDraft).toBe(true);
    });
  });
});
