import type { ReviewJob } from '../../frameworks/queue/pQueueAdapter.js'

export class ReviewJobFactory {
  static create(overrides?: Partial<ReviewJob>): ReviewJob {
    return {
      id: 'gitlab:test-org/test-project:42',
      platform: 'gitlab',
      projectPath: 'test-org/test-project',
      localPath: '/tmp/repos/test-project',
      mrNumber: 42,
      skill: 'code-review',
      mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
      sourceBranch: 'feature/test',
      targetBranch: 'main',
      jobType: 'review',
      ...overrides,
    }
  }

  static createQueued(overrides?: Partial<ReviewJob>): ReviewJob {
    return this.create(overrides)
  }

  static createRunning(overrides?: Partial<ReviewJob>): ReviewJob {
    return this.create(overrides)
  }

  static createCompleted(overrides?: Partial<ReviewJob>): ReviewJob {
    return this.create(overrides)
  }

  static createFollowup(overrides?: Partial<ReviewJob>): ReviewJob {
    return this.create({
      jobType: 'followup',
      ...overrides,
    })
  }

  static createGitHub(overrides?: Partial<ReviewJob>): ReviewJob {
    return this.create({
      id: 'github:test-owner/test-repo:123',
      platform: 'github',
      projectPath: 'test-owner/test-repo',
      mrUrl: 'https://github.com/test-owner/test-repo/pull/123',
      mrNumber: 123,
      ...overrides,
    })
  }
}
