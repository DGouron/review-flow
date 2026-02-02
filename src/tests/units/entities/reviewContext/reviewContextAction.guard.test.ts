import { describe, it, expect } from 'vitest'
import {
  parseReviewContextAction,
  safeParseReviewContextAction,
  isValidReviewContextAction,
  parseReviewContextActions,
  parseReviewContextResult,
  isValidReviewContextResult,
} from '../../../../entities/reviewContext/reviewContextAction.guard.js'

describe('ReviewContextAction Guard', () => {
  describe('parseReviewContextAction', () => {
    it('should parse a valid THREAD_RESOLVE action', () => {
      const action = {
        type: 'THREAD_RESOLVE',
        threadId: 'PRRT_kwDONxxx',
        message: 'Fixed',
      }

      const result = parseReviewContextAction(action)

      expect(result.type).toBe('THREAD_RESOLVE')
      if (result.type === 'THREAD_RESOLVE') {
        expect(result.threadId).toBe('PRRT_kwDONxxx')
      }
    })

    it('should throw on invalid action', () => {
      const action = { type: 'INVALID' }

      expect(() => parseReviewContextAction(action)).toThrow()
    })
  })

  describe('safeParseReviewContextAction', () => {
    it('should return success true for valid action', () => {
      const action = { type: 'POST_COMMENT', body: 'Hello' }

      const result = safeParseReviewContextAction(action)

      expect(result.success).toBe(true)
    })

    it('should return success false for invalid action', () => {
      const action = { type: 'UNKNOWN' }

      const result = safeParseReviewContextAction(action)

      expect(result.success).toBe(false)
    })
  })

  describe('isValidReviewContextAction', () => {
    it('should return true for valid action', () => {
      const action = { type: 'ADD_LABEL', label: 'needs_approve' }

      expect(isValidReviewContextAction(action)).toBe(true)
    })

    it('should return false for invalid action', () => {
      expect(isValidReviewContextAction(null)).toBe(false)
      expect(isValidReviewContextAction({ type: 'BAD' })).toBe(false)
    })
  })

  describe('parseReviewContextActions', () => {
    it('should parse an array of actions', () => {
      const actions = [
        { type: 'THREAD_RESOLVE', threadId: 'abc' },
        { type: 'POST_COMMENT', body: 'Done' },
      ]

      const result = parseReviewContextActions(actions)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('THREAD_RESOLVE')
      expect(result[1].type).toBe('POST_COMMENT')
    })
  })
})

describe('ReviewContextResult Guard', () => {
  describe('parseReviewContextResult', () => {
    it('should parse a valid result', () => {
      const data = {
        blocking: 0,
        warnings: 1,
        suggestions: 2,
        score: 9,
        verdict: 'ready_to_merge',
      }

      const result = parseReviewContextResult(data)

      expect(result.verdict).toBe('ready_to_merge')
      expect(result.score).toBe(9)
    })
  })

  describe('isValidReviewContextResult', () => {
    it('should return true for valid result', () => {
      const data = {
        blocking: 1,
        warnings: 0,
        suggestions: 0,
        score: 5,
        verdict: 'needs_fixes',
      }

      expect(isValidReviewContextResult(data)).toBe(true)
    })

    it('should return false for invalid result', () => {
      expect(isValidReviewContextResult({ verdict: 'bad' })).toBe(false)
    })
  })
})
