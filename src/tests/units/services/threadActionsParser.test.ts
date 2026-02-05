import {
  parseThreadActions,
  type ThreadReplyAction,
  type ThreadResolveAction,
  type PostCommentAction,
} from '../../../services/threadActionsParser.js'

describe('parseThreadActions', () => {
  describe('THREAD_REPLY marker', () => {
    it('should parse a simple THREAD_REPLY marker', () => {
      const stdout = '[THREAD_REPLY:abc123:✅ **Corrigé** - Message]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'THREAD_REPLY',
        threadId: 'abc123',
        message: '✅ **Corrigé** - Message',
      })
    })

    it('should handle message containing colons', () => {
      const stdout = '[THREAD_REPLY:abc123:Type `any` replaced by `UserDTO`: see line 42]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      const action = actions[0] as ThreadReplyAction
      expect(action.message).toBe('Type `any` replaced by `UserDTO`: see line 42')
    })

    it('should handle empty message', () => {
      const stdout = '[THREAD_REPLY:abc123:]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      const action = actions[0] as ThreadReplyAction
      expect(action.message).toBe('')
    })
  })

  describe('THREAD_RESOLVE marker', () => {
    it('should parse a THREAD_RESOLVE marker', () => {
      const stdout = '[THREAD_RESOLVE:abc123]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'THREAD_RESOLVE',
        threadId: 'abc123',
      })
    })

    it('should handle GitHub thread IDs with prefix', () => {
      const stdout = '[THREAD_RESOLVE:PRRT_kwDOAbc123]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      const action = actions[0] as ThreadResolveAction
      expect(action.threadId).toBe('PRRT_kwDOAbc123')
    })
  })

  describe('POST_COMMENT marker', () => {
    it('should parse a simple POST_COMMENT marker', () => {
      const stdout = '[POST_COMMENT:## Follow-up Review Complete]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'POST_COMMENT',
        body: '## Follow-up Review Complete',
      })
    })

    it('should preserve escaped newlines in body', () => {
      const stdout = '[POST_COMMENT:## Titre\\n\\nParagraphe 1\\n\\nParagraphe 2]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      const action = actions[0] as PostCommentAction
      expect(action.body).toBe('## Titre\n\nParagraphe 1\n\nParagraphe 2')
    })

    it('should handle colons in markdown content', () => {
      const stdout = '[POST_COMMENT:## Summary\\n\\n- Score: 8/10\\n- Status: Done]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      const action = actions[0] as PostCommentAction
      expect(action.body).toBe('## Summary\n\n- Score: 8/10\n- Status: Done')
    })
  })

  describe('FETCH_THREADS marker', () => {
    it('should parse a FETCH_THREADS marker', () => {
      const stdout = '[FETCH_THREADS]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'FETCH_THREADS',
      })
    })
  })

  describe('multiple markers', () => {
    it('should parse multiple markers in order', () => {
      const stdout = `
Some output text
[THREAD_REPLY:abc:Message 1]
More text here
[THREAD_RESOLVE:abc]
[THREAD_REPLY:def:Message 2]
Final output
      `

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(3)
      expect(actions[0]).toEqual({ type: 'THREAD_REPLY', threadId: 'abc', message: 'Message 1' })
      expect(actions[1]).toEqual({ type: 'THREAD_RESOLVE', threadId: 'abc' })
      expect(actions[2]).toEqual({ type: 'THREAD_REPLY', threadId: 'def', message: 'Message 2' })
    })

    it('should preserve order for mixed action types', () => {
      const stdout = `
[FETCH_THREADS]
[THREAD_REPLY:abc:Fixed]
[POST_COMMENT:Review done]
[THREAD_RESOLVE:abc]
      `

      const actions = parseThreadActions(stdout)

      expect(actions.map(a => a.type)).toEqual([
        'FETCH_THREADS',
        'THREAD_REPLY',
        'POST_COMMENT',
        'THREAD_RESOLVE',
      ])
    })
  })

  describe('edge cases', () => {
    it('should return empty array for stdout without markers', () => {
      const stdout = 'Just regular output without any markers'

      const actions = parseThreadActions(stdout)

      expect(actions).toEqual([])
    })

    it('should ignore malformed markers', () => {
      const stdout = `
[THREAD_REPLY]
[THREAD_RESOLVE]
[THREAD_REPLY:abc]
[UNKNOWN_ACTION:abc:message]
      `

      const actions = parseThreadActions(stdout)

      expect(actions).toEqual([])
    })

    it('should handle markers on same line', () => {
      const stdout = '[THREAD_RESOLVE:abc][THREAD_RESOLVE:def]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(2)
      const action0 = actions[0] as ThreadResolveAction
      const action1 = actions[1] as ThreadResolveAction
      expect(action0.threadId).toBe('abc')
      expect(action1.threadId).toBe('def')
    })

    it('should handle special characters in thread IDs', () => {
      const stdout = '[THREAD_RESOLVE:abc123def456-_]'

      const actions = parseThreadActions(stdout)

      expect(actions).toHaveLength(1)
      const action = actions[0] as ThreadResolveAction
      expect(action.threadId).toBe('abc123def456-_')
    })
  })
})
