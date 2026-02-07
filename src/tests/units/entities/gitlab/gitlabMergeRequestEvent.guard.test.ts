import { describe, it, expect } from 'vitest'
import { gitLabMergeRequestEventGuard } from '../../../../entities/gitlab/gitlabMergeRequestEvent.guard.js'
import { GitLabEventFactory } from '../../../factories/gitLabEvent.factory.js'

describe('gitLabMergeRequestEventGuard', () => {
  describe('safeParse', () => {
    it('should return success for valid MR payload', () => {
      const validPayload = GitLabEventFactory.createMergeRequestEvent()

      const result = gitLabMergeRequestEventGuard.safeParse(validPayload)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.object_kind).toBe('merge_request')
        expect(result.data.object_attributes.iid).toBe(42)
      }
    })

    it('should return success for payload with reviewer changes', () => {
      const validPayload = GitLabEventFactory.createWithReviewerAdded('claude-reviewer')

      const result = gitLabMergeRequestEventGuard.safeParse(validPayload)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changes?.reviewers?.current[0].username).toBe('claude-reviewer')
      }
    })

    it('should return failure for incomplete payload', () => {
      const incompletePayload = {
        object_kind: 'merge_request',
      }

      const result = gitLabMergeRequestEventGuard.safeParse(incompletePayload)

      expect(result.success).toBe(false)
    })

    it('should return failure for payload with wrong object_kind', () => {
      const wrongKindPayload = {
        ...GitLabEventFactory.createMergeRequestEvent(),
        object_kind: 'push',
      }

      const result = gitLabMergeRequestEventGuard.safeParse(wrongKindPayload)

      expect(result.success).toBe(false)
    })

    it('should return failure for payload with invalid state', () => {
      const invalidStatePayload = {
        ...GitLabEventFactory.createMergeRequestEvent(),
        object_attributes: {
          ...GitLabEventFactory.createMergeRequestEvent().object_attributes,
          state: 'invalid_state',
        },
      }

      const result = gitLabMergeRequestEventGuard.safeParse(invalidStatePayload)

      expect(result.success).toBe(false)
    })

    it('should return success for payload with assignees', () => {
      const payloadWithAssignees = {
        ...GitLabEventFactory.createMergeRequestEvent(),
        assignees: [
          { username: 'mr-owner', name: 'MR Owner' },
          { username: 'co-assignee', name: 'Co Assignee' },
        ],
      }

      const result = gitLabMergeRequestEventGuard.safeParse(payloadWithAssignees)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.assignees).toHaveLength(2)
        expect(result.data.assignees?.[0].username).toBe('mr-owner')
        expect(result.data.assignees?.[0].name).toBe('MR Owner')
      }
    })

    it('should return success for payload with empty assignees array', () => {
      const payloadWithEmptyAssignees = {
        ...GitLabEventFactory.createMergeRequestEvent(),
        assignees: [],
      }

      const result = gitLabMergeRequestEventGuard.safeParse(payloadWithEmptyAssignees)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.assignees).toEqual([])
      }
    })

    it('should return success for payload without assignees field', () => {
      const payloadWithoutAssignees = GitLabEventFactory.createMergeRequestEvent()
      ;(payloadWithoutAssignees as Record<string, unknown>).assignees = undefined

      const result = gitLabMergeRequestEventGuard.safeParse(payloadWithoutAssignees)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.assignees).toBeUndefined()
      }
    })
  })

  describe('isValid', () => {
    it('should return true for valid payload', () => {
      const validPayload = GitLabEventFactory.createMergeRequestEvent()

      expect(gitLabMergeRequestEventGuard.isValid(validPayload)).toBe(true)
    })

    it('should return false for invalid payload', () => {
      const invalidPayload = { random: 'data' }

      expect(gitLabMergeRequestEventGuard.isValid(invalidPayload)).toBe(false)
    })
  })
})
