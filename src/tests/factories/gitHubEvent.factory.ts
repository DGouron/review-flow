import type { GitHubPullRequestEvent } from '../../interface-adapters/controllers/webhook/eventFilter.js'

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

export class GitHubEventFactory {
  static createPullRequestEvent(
    overrides?: DeepPartial<GitHubPullRequestEvent>
  ): GitHubPullRequestEvent {
    const base: GitHubPullRequestEvent = {
      action: 'opened',
      number: 123,
      pull_request: {
        number: 123,
        title: 'Test PR',
        body: 'Test description',
        state: 'open',
        draft: false,
        html_url: 'https://github.com/test-owner/test-repo/pull/123',
        head: {
          ref: 'feature/test',
        },
        base: {
          ref: 'main',
        },
        requested_reviewers: [],
      },
      repository: {
        full_name: 'test-owner/test-repo',
        html_url: 'https://github.com/test-owner/test-repo',
        clone_url: 'https://github.com/test-owner/test-repo.git',
      },
      sender: {
        login: 'developer',
      },
    }

    return overrides ? deepMerge(base, overrides) : base
  }

  static createReviewRequestedPr(reviewerLogin: string): GitHubPullRequestEvent {
    return this.createPullRequestEvent({
      action: 'review_requested',
      requested_reviewer: {
        login: reviewerLogin,
      },
      pull_request: {
        requested_reviewers: [{ login: reviewerLogin }],
      },
    })
  }

  static createDraftPr(): GitHubPullRequestEvent {
    return this.createPullRequestEvent({
      pull_request: {
        draft: true,
      },
    })
  }

  static createClosedPr(): GitHubPullRequestEvent {
    return this.createPullRequestEvent({
      action: 'closed',
      pull_request: {
        state: 'closed',
      },
    })
  }

  static createMergedPr(): GitHubPullRequestEvent {
    return this.createPullRequestEvent({
      action: 'closed',
      pull_request: {
        state: 'closed',
      },
    })
  }
}
