import { describe, it, expect } from 'vitest'
import { parseReviewAction, isValidReviewAction } from '../../../../entities/reviewAction/reviewAction.guard.js'

describe('reviewAction.guard', () => {
  describe('isValidReviewAction', () => {
    it('should return true for valid action', () => {
      const input = { type: 'THREAD_RESOLVE', threadId: 'thread-123' }
      expect(isValidReviewAction(input)).toBe(true)
    })

    it('should return false for invalid action', () => {
      const input = { type: 'INVALID_TYPE' }
      expect(isValidReviewAction(input)).toBe(false)
    })

    it('should return false for missing required fields', () => {
      const input = { type: 'THREAD_RESOLVE' } // missing threadId
      expect(isValidReviewAction(input)).toBe(false)
    })
  })

  describe('parseReviewAction', () => {
    it('should parse a valid THREAD_RESOLVE action', () => {
      const input = {
        type: 'THREAD_RESOLVE',
        threadId: 'thread-123',
      }

      const result = parseReviewAction(input)

      expect(result.type).toBe('THREAD_RESOLVE')
      if (result.type === 'THREAD_RESOLVE') {
        expect(result.threadId).toBe('thread-123')
      }
    })

    it('should parse a valid POST_COMMENT action', () => {
      const input = {
        type: 'POST_COMMENT',
        body: 'This is a comment',
      }

      const result = parseReviewAction(input)

      expect(result.type).toBe('POST_COMMENT')
      if (result.type === 'POST_COMMENT') {
        expect(result.body).toBe('This is a comment')
      }
    })

    it('should parse a valid THREAD_REPLY action', () => {
      const input = {
        type: 'THREAD_REPLY',
        threadId: 'thread-456',
        message: 'Reply message',
      }

      const result = parseReviewAction(input)

      expect(result.type).toBe('THREAD_REPLY')
      if (result.type === 'THREAD_REPLY') {
        expect(result.threadId).toBe('thread-456')
        expect(result.message).toBe('Reply message')
      }
    })

    it('should parse a valid ADD_LABEL action', () => {
      const input = {
        type: 'ADD_LABEL',
        label: 'needs-review',
      }

      const result = parseReviewAction(input)

      expect(result.type).toBe('ADD_LABEL')
      if (result.type === 'ADD_LABEL') {
        expect(result.label).toBe('needs-review')
      }
    })

    it('should parse a valid FETCH_THREADS action', () => {
      const input = {
        type: 'FETCH_THREADS',
      }

      const result = parseReviewAction(input)

      expect(result.type).toBe('FETCH_THREADS')
    })
  })
})
