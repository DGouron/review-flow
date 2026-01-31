import type { GitLabMergeRequestEvent, GitLabPushEvent } from '../../webhooks/eventFilter.js'

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target }
  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = target[key]
    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue as DeepPartial<typeof targetValue>)
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[typeof key]
    }
  }
  return result
}

export class GitLabEventFactory {
  static createMergeRequestEvent(
    overrides?: DeepPartial<GitLabMergeRequestEvent>
  ): GitLabMergeRequestEvent {
    const base: GitLabMergeRequestEvent = {
      object_kind: 'merge_request',
      event_type: 'merge_request',
      user: {
        username: 'developer',
        name: 'Dev User',
      },
      project: {
        id: 1,
        name: 'test-project',
        path_with_namespace: 'test-org/test-project',
        web_url: 'https://gitlab.com/test-org/test-project',
        git_http_url: 'https://gitlab.com/test-org/test-project.git',
      },
      object_attributes: {
        iid: 42,
        title: 'Test MR',
        description: 'Test description',
        state: 'opened',
        action: 'open',
        source_branch: 'feature/test',
        target_branch: 'main',
        url: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
        draft: false,
      },
      reviewers: [],
    }

    return overrides ? deepMerge(base, overrides) : base
  }

  static createWithReviewerAdded(reviewerUsername: string): GitLabMergeRequestEvent {
    return this.createMergeRequestEvent({
      object_attributes: {
        action: 'update',
      },
      reviewers: [{ username: reviewerUsername, name: 'Claude Reviewer' }],
      changes: {
        reviewers: {
          previous: [],
          current: [{ username: reviewerUsername }],
        },
      },
    })
  }

  static createDraftMr(): GitLabMergeRequestEvent {
    return this.createMergeRequestEvent({
      object_attributes: {
        draft: true,
      },
    })
  }

  static createClosedMr(): GitLabMergeRequestEvent {
    return this.createMergeRequestEvent({
      object_attributes: {
        state: 'closed',
        action: 'close',
      },
    })
  }

  static createMergedMr(): GitLabMergeRequestEvent {
    return this.createMergeRequestEvent({
      object_attributes: {
        state: 'merged',
        action: 'merge',
      },
    })
  }

  static createMrUpdate(): GitLabMergeRequestEvent {
    return this.createMergeRequestEvent({
      object_attributes: {
        action: 'update',
      },
    })
  }

  static createPushEvent(overrides?: DeepPartial<GitLabPushEvent>): GitLabPushEvent {
    const base: GitLabPushEvent = {
      object_kind: 'push',
      ref: 'refs/heads/feature/test',
      project: {
        id: 1,
        path_with_namespace: 'test-org/test-project',
        web_url: 'https://gitlab.com/test-org/test-project',
      },
      commits: [
        {
          id: 'abc123',
          message: 'Test commit',
        },
      ],
    }

    return overrides ? deepMerge(base, overrides) : base
  }
}
