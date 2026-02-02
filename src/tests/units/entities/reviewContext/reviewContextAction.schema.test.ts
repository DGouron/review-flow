import { describe, it, expect } from 'vitest'
import {
  reviewContextActionSchema,
  reviewContextResultSchema,
} from '../../../../entities/reviewContext/reviewContextAction.schema.js'

describe('ReviewContextAction', () => {
  describe('ThreadResolveAction', () => {
    it('should validate a thread resolve action with required fields', () => {
      const action = {
        type: 'THREAD_RESOLVE',
        threadId: 'PRRT_kwDONxxx',
      }

      const result = reviewContextActionSchema.safeParse(action)

      expect(result.success).toBe(true)
    })

    it('should validate a thread resolve action with optional message', () => {
      const action = {
        type: 'THREAD_RESOLVE',
        threadId: 'PRRT_kwDONxxx',
        message: 'Fixed - Added null check',
      }

      const result = reviewContextActionSchema.safeParse(action)

      expect(result.success).toBe(true)
      if (result.success && result.data.type === 'THREAD_RESOLVE') {
        expect(result.data.message).toBe('Fixed - Added null check')
      }
    })
  })

  describe('PostCommentAction', () => {
    it('should validate a post comment action', () => {
      const action = {
        type: 'POST_COMMENT',
        body: '## Follow-up Review\n\nAll issues fixed.',
      }

      const result = reviewContextActionSchema.safeParse(action)

      expect(result.success).toBe(true)
    })
  })

  describe('AddLabelAction', () => {
    it('should validate an add label action', () => {
      const action = {
        type: 'ADD_LABEL',
        label: 'needs_approve',
      }

      const result = reviewContextActionSchema.safeParse(action)

      expect(result.success).toBe(true)
    })
  })

  describe('Invalid actions', () => {
    it('should reject action with unknown type', () => {
      const action = {
        type: 'UNKNOWN_ACTION',
        data: 'something',
      }

      const result = reviewContextActionSchema.safeParse(action)

      expect(result.success).toBe(false)
    })

    it('should reject thread resolve without threadId', () => {
      const action = {
        type: 'THREAD_RESOLVE',
      }

      const result = reviewContextActionSchema.safeParse(action)

      expect(result.success).toBe(false)
    })
  })

  describe('ReviewContextResult', () => {
    it('should validate a complete result', () => {
      const resultData = {
        blocking: 0,
        warnings: 2,
        suggestions: 3,
        score: 10,
        verdict: 'ready_to_merge',
      }

      const result = reviewContextResultSchema.safeParse(resultData)

      expect(result.success).toBe(true)
    })

    it('should reject result with invalid verdict', () => {
      const resultData = {
        blocking: 0,
        warnings: 0,
        suggestions: 0,
        score: 10,
        verdict: 'invalid_verdict',
      }

      const result = reviewContextResultSchema.safeParse(resultData)

      expect(result.success).toBe(false)
    })
  })
})
