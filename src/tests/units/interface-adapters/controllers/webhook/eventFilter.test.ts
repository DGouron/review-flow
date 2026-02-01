import { vi } from 'vitest'
import { GitLabEventFactory } from '../../../../factories/gitLabEvent.factory.js'
import { GitHubEventFactory } from '../../../../factories/gitHubEvent.factory.js'

vi.mock('../../../../../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    user: {
      gitlabUsername: 'claude-reviewer',
      githubUsername: 'claude-reviewer',
    },
  })),
}))

import {
  filterGitLabEvent,
  filterGitLabMrUpdate,
  filterGitLabMrClose,
  filterGitHubEvent,
  filterGitHubPrClose,
} from '../../../../../interface-adapters/controllers/webhook/eventFilter.js'

describe('filterGitLabEvent', () => {
  describe('when MR is opened with reviewer assigned', () => {
    it('should process when claude-reviewer is newly added as reviewer', () => {
      const event = GitLabEventFactory.createWithReviewerAdded('claude-reviewer')

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(true)
      expect(result.reason).toContain('claude-reviewer')
      expect(result.mrNumber).toBe(42)
      expect(result.projectPath).toBe('test-org/test-project')
    })
  })

  describe('when MR is draft', () => {
    it('should not process draft MRs', () => {
      const event = GitLabEventFactory.createDraftMr()
      event.changes = {
        reviewers: {
          previous: [],
          current: [{ username: 'claude-reviewer' }],
        },
      }

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('draft')
    })
  })

  describe('when reviewer is not claude-reviewer', () => {
    it('should not process when different reviewer is added', () => {
      const event = GitLabEventFactory.createWithReviewerAdded('other-reviewer')

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('claude-reviewer')
    })
  })

  describe('when MR is not in opened state', () => {
    it('should not process closed MRs', () => {
      const event = GitLabEventFactory.createClosedMr()

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('closed')
    })

    it('should not process merged MRs', () => {
      const event = GitLabEventFactory.createMergedMr()

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('merged')
    })
  })

  describe('when object_kind is not merge_request', () => {
    it('should not process non-MR events', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_kind: 'push' as 'merge_request',
      })

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('Not a merge request')
    })
  })

  describe('when reviewer was already assigned (no change)', () => {
    it('should not process when no reviewer change detected', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        reviewers: [{ username: 'claude-reviewer', name: 'Claude' }],
      })

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('was not added as reviewer')
    })
  })

  describe('when reviewer was in previous and current', () => {
    it('should not trigger when reviewer was already present', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: { action: 'update' },
        reviewers: [{ username: 'claude-reviewer', name: 'Claude' }],
        changes: {
          reviewers: {
            previous: [{ username: 'claude-reviewer' }],
            current: [{ username: 'claude-reviewer' }],
          },
        },
      })

      const result = filterGitLabEvent(event)

      expect(result.shouldProcess).toBe(false)
    })
  })
})

describe('filterGitLabMrUpdate', () => {
  describe('when MR receives update action', () => {
    it('should process update events for followup', () => {
      const event = GitLabEventFactory.createMrUpdate()

      const result = filterGitLabMrUpdate(event)

      expect(result.shouldProcess).toBe(true)
      expect(result.isFollowup).toBe(true)
      expect(result.reason).toContain('updated')
    })
  })

  describe('when MR is draft', () => {
    it('should not process draft MR updates', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          action: 'update',
          draft: true,
        },
      })

      const result = filterGitLabMrUpdate(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('draft')
    })
  })

  describe('when action is not update', () => {
    it('should not process open actions', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: { action: 'open' },
      })

      const result = filterGitLabMrUpdate(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('open')
    })
  })

  describe('when MR state is not opened', () => {
    it('should not process closed MR updates', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          state: 'closed',
          action: 'update',
        },
      })

      const result = filterGitLabMrUpdate(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('closed')
    })
  })
})

describe('filterGitLabMrClose', () => {
  describe('when MR is closed', () => {
    it('should detect closure for cleanup', () => {
      const event = GitLabEventFactory.createClosedMr()

      const result = filterGitLabMrClose(event)

      expect(result.shouldProcess).toBe(true)
      expect(result.reason).toContain('closed')
      expect(result.mrNumber).toBe(42)
    })
  })

  describe('when action is not close', () => {
    it('should not process non-close actions', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: { action: 'update' },
      })

      const result = filterGitLabMrClose(event)

      expect(result.shouldProcess).toBe(false)
    })
  })

  describe('when state is not closed', () => {
    it('should not process if state mismatch', () => {
      const event = GitLabEventFactory.createMergeRequestEvent({
        object_attributes: {
          action: 'close',
          state: 'opened',
        },
      })

      const result = filterGitLabMrClose(event)

      expect(result.shouldProcess).toBe(false)
    })
  })
})

describe('filterGitHubEvent', () => {
  describe('when PR has review_requested action with correct reviewer', () => {
    it('should process when claude-reviewer is requested', () => {
      const event = GitHubEventFactory.createReviewRequestedPr('claude-reviewer')

      const result = filterGitHubEvent(event)

      expect(result.shouldProcess).toBe(true)
      expect(result.reason).toContain('claude-reviewer')
      expect(result.mrNumber).toBe(123)
      expect(result.projectPath).toBe('test-owner/test-repo')
    })
  })

  describe('when action is not review_requested', () => {
    it('should not process opened action', () => {
      const event = GitHubEventFactory.createPullRequestEvent({ action: 'opened' })

      const result = filterGitHubEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('opened')
    })
  })

  describe('when PR is draft', () => {
    it('should not process draft PRs even with review requested', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'review_requested',
        requested_reviewer: { login: 'claude-reviewer' },
        pull_request: { draft: true },
      })

      const result = filterGitHubEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('draft')
    })
  })

  describe('when requested reviewer is not claude-reviewer', () => {
    it('should not process when different reviewer requested', () => {
      const event = GitHubEventFactory.createReviewRequestedPr('other-reviewer')

      const result = filterGitHubEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('other-reviewer')
    })
  })

  describe('when PR state is not open', () => {
    it('should not process closed PRs', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'review_requested',
        requested_reviewer: { login: 'claude-reviewer' },
        pull_request: { state: 'closed' },
      })

      const result = filterGitHubEvent(event)

      expect(result.shouldProcess).toBe(false)
      expect(result.reason).toContain('closed')
    })
  })
})

describe('filterGitHubPrClose', () => {
  describe('when PR is closed', () => {
    it('should detect closure for cleanup', () => {
      const event = GitHubEventFactory.createClosedPr()

      const result = filterGitHubPrClose(event)

      expect(result.shouldProcess).toBe(true)
      expect(result.reason).toContain('closed')
      expect(result.mrNumber).toBe(123)
    })
  })

  describe('when action is not closed', () => {
    it('should not process non-closed actions', () => {
      const event = GitHubEventFactory.createPullRequestEvent({ action: 'opened' })

      const result = filterGitHubPrClose(event)

      expect(result.shouldProcess).toBe(false)
    })
  })

  describe('when state is not closed', () => {
    it('should not process if state mismatch', () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'closed',
        pull_request: { state: 'open' },
      })

      const result = filterGitHubPrClose(event)

      expect(result.shouldProcess).toBe(false)
    })
  })
})
