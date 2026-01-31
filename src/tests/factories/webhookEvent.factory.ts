import type { GitLabMergeRequestEvent, GitHubPullRequestEvent } from '../../webhooks/eventFilter.js';

export class GitLabEventFactory {
  static createMergeRequestEvent(
    overrides: Partial<GitLabMergeRequestEvent> = {}
  ): GitLabMergeRequestEvent {
    return {
      object_kind: 'merge_request',
      event_type: 'merge_request',
      user: {
        username: 'author',
        name: 'Author Name',
        ...overrides.user,
      },
      project: {
        id: 123,
        name: 'my-project',
        path_with_namespace: 'my-org/my-project',
        web_url: 'https://gitlab.com/my-org/my-project',
        git_http_url: 'https://gitlab.com/my-org/my-project.git',
        ...overrides.project,
      },
      object_attributes: {
        iid: 42,
        title: 'feat: add new feature',
        description: 'This is a description',
        state: 'opened',
        action: 'update',
        source_branch: 'feature/new-feature',
        target_branch: 'main',
        url: 'https://gitlab.com/my-org/my-project/-/merge_requests/42',
        draft: false,
        ...overrides.object_attributes,
      },
      reviewers: overrides.reviewers ?? [{ username: 'claude', name: 'Claude' }],
      changes: overrides.changes,
    };
  }
}

export class GitHubEventFactory {
  static createPullRequestEvent(
    overrides: Partial<GitHubPullRequestEvent> = {}
  ): GitHubPullRequestEvent {
    return {
      action: 'review_requested',
      number: 123,
      pull_request: {
        number: 123,
        title: 'fix: bug fix',
        body: 'Fixes the bug',
        state: 'open',
        draft: false,
        html_url: 'https://github.com/my-org/my-project/pull/123',
        head: {
          ref: 'fix/bug-fix',
        },
        base: {
          ref: 'main',
        },
        requested_reviewers: [{ login: 'claude' }],
        ...overrides.pull_request,
      },
      requested_reviewer: overrides.requested_reviewer,
      repository: {
        full_name: 'my-org/my-project',
        html_url: 'https://github.com/my-org/my-project',
        clone_url: 'https://github.com/my-org/my-project.git',
        ...overrides.repository,
      },
      sender: {
        login: 'author',
        ...overrides.sender,
      },
      ...overrides,
    };
  }
}
