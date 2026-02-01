import { describe, it, expect } from 'vitest'
import { gitHubPullRequestEventGuard } from '../../../../entities/github/githubPullRequestEvent.guard.js'
import { GitHubEventFactory } from '../../../factories/gitHubEvent.factory.js'

describe('gitHubPullRequestEventGuard', () => {
  describe('safeParse', () => {
    it('should return success for valid review_requested payload', () => {
      const validPayload = GitHubEventFactory.createReviewRequestedPr('claude-bot')

      const result = gitHubPullRequestEventGuard.safeParse(validPayload)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.action).toBe('review_requested')
        expect(result.data.pull_request.number).toBe(123)
      }
    })

    it('should return failure for invalid payload', () => {
      const invalidPayload = { action: 'opened' }

      const result = gitHubPullRequestEventGuard.safeParse(invalidPayload)

      expect(result.success).toBe(false)
    })
  })
})
