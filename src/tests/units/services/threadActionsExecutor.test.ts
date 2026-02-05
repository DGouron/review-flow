import {
  executeThreadActions,
  type ExecutionContext,
  type CommandExecutor,
} from '../../../services/threadActionsExecutor.js'
import type { ThreadAction } from '../../../services/threadActionsParser.js'

describe('executeThreadActions', () => {
  const mockExecutor: CommandExecutor = vi.fn()
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('GitLab platform', () => {
    const gitlabContext: ExecutionContext = {
      platform: 'gitlab',
      projectPath: 'mentor-goal/main-app-v3',
      mrNumber: 4658,
      localPath: '/tmp/repo',
    }

    it('should execute THREAD_REPLY with correct glab command', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_REPLY', threadId: 'abc123', message: 'Fixed!' },
      ]

      await executeThreadActions(actions, gitlabContext, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'glab',
        [
          'api',
          '--method',
          'POST',
          'projects/mentor-goal%2Fmain-app-v3/merge_requests/4658/discussions/abc123/notes',
          '--field',
          "body=Fixed!",
        ],
        '/tmp/repo'
      )
    })

    it('should execute THREAD_RESOLVE with correct glab command', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 'abc123' },
      ]

      await executeThreadActions(actions, gitlabContext, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'glab',
        [
          'api',
          '--method',
          'PUT',
          'projects/mentor-goal%2Fmain-app-v3/merge_requests/4658/discussions/abc123',
          '--field',
          'resolved=true',
        ],
        '/tmp/repo'
      )
    })

    it('should execute POST_COMMENT with correct glab command', async () => {
      const actions: ThreadAction[] = [
        { type: 'POST_COMMENT', body: '## Review Complete' },
      ]

      await executeThreadActions(actions, gitlabContext, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'glab',
        [
          'api',
          '--method',
          'POST',
          'projects/mentor-goal%2Fmain-app-v3/merge_requests/4658/notes',
          '--field',
          'body=## Review Complete',
        ],
        '/tmp/repo'
      )
    })

    it('should URL-encode project path with slashes', async () => {
      const contextWithSlash: ExecutionContext = {
        ...gitlabContext,
        projectPath: 'group/subgroup/project',
      }
      const actions: ThreadAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 'abc' },
      ]

      await executeThreadActions(actions, contextWithSlash, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'glab',
        expect.arrayContaining([
          expect.stringContaining('group%2Fsubgroup%2Fproject'),
        ]),
        '/tmp/repo'
      )
    })
  })

  describe('GitHub platform', () => {
    const githubContext: ExecutionContext = {
      platform: 'github',
      projectPath: 'owner/repo',
      mrNumber: 123,
      localPath: '/tmp/repo',
    }

    it('should execute THREAD_RESOLVE with gh graphql mutation', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 'PRRT_abc123' },
      ]

      await executeThreadActions(actions, githubContext, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          'graphql',
          '-f',
          'query=mutation { resolveReviewThread(input: {threadId: "PRRT_abc123"}) { thread { id isResolved } } }',
        ],
        '/tmp/repo'
      )
    })

    it('should execute THREAD_REPLY with gh api command', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_REPLY', threadId: '12345', message: 'Fixed!' },
      ]

      await executeThreadActions(actions, githubContext, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          '--method',
          'POST',
          'repos/owner/repo/pulls/123/comments/12345/replies',
          '--field',
          'body=Fixed!',
        ],
        '/tmp/repo'
      )
    })

    it('should execute POST_COMMENT with gh api command', async () => {
      const actions: ThreadAction[] = [
        { type: 'POST_COMMENT', body: '## Review Complete' },
      ]

      await executeThreadActions(actions, githubContext, mockLogger, mockExecutor)

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          '--method',
          'POST',
          'repos/owner/repo/issues/123/comments',
          '--field',
          'body=## Review Complete',
        ],
        '/tmp/repo'
      )
    })
  })

  describe('FETCH_THREADS action', () => {
    it('should be a no-op (placeholder for future implementation)', async () => {
      const actions: ThreadAction[] = [{ type: 'FETCH_THREADS' }]
      const context: ExecutionContext = {
        platform: 'gitlab',
        projectPath: 'test/project',
        mrNumber: 1,
        localPath: '/tmp/repo',
      }

      await executeThreadActions(actions, context, mockLogger, mockExecutor)

      expect(mockExecutor).not.toHaveBeenCalled()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FETCH_THREADS' }),
        expect.any(String)
      )
    })
  })

  describe('execution order and error handling', () => {
    const context: ExecutionContext = {
      platform: 'gitlab',
      projectPath: 'test/project',
      mrNumber: 1,
      localPath: '/tmp/repo',
    }

    it('should execute actions in order', async () => {
      const executionOrder: string[] = []
      const trackingExecutor: CommandExecutor = vi.fn((_cmd, args) => {
        const threadId = args.find((a: string) => a.includes('discussions/'))?.split('discussions/')[1]?.split('/')[0]
        executionOrder.push(threadId || 'unknown')
      })

      const actions: ThreadAction[] = [
        { type: 'THREAD_REPLY', threadId: 'first', message: 'msg' },
        { type: 'THREAD_RESOLVE', threadId: 'second' },
        { type: 'THREAD_REPLY', threadId: 'third', message: 'msg' },
      ]

      await executeThreadActions(actions, context, mockLogger, trackingExecutor)

      expect(executionOrder).toEqual(['first', 'second', 'third'])
    })

    it('should continue execution after API error', async () => {
      const failingExecutor: CommandExecutor = vi.fn()
        .mockImplementationOnce(() => { throw new Error('API 404') })
        .mockImplementationOnce(() => {})

      const actions: ThreadAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 'invalid' },
        { type: 'THREAD_RESOLVE', threadId: 'valid' },
      ]

      const result = await executeThreadActions(actions, context, mockLogger, failingExecutor)

      expect(failingExecutor).toHaveBeenCalledTimes(2)
      expect(mockLogger.error).toHaveBeenCalledTimes(1)
      expect(result.failed).toBe(1)
      expect(result.succeeded).toBe(1)
    })

    it('should return execution summary', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 'a' },
        { type: 'THREAD_RESOLVE', threadId: 'b' },
        { type: 'FETCH_THREADS' },
      ]

      const result = await executeThreadActions(actions, context, mockLogger, mockExecutor)

      expect(result).toEqual({
        total: 3,
        succeeded: 2,
        failed: 0,
        skipped: 1,
      })
    })
  })

  describe('empty actions', () => {
    it('should return zero counts for empty actions array', async () => {
      const context: ExecutionContext = {
        platform: 'gitlab',
        projectPath: 'test/project',
        mrNumber: 1,
        localPath: '/tmp/repo',
      }

      const result = await executeThreadActions([], context, mockLogger, mockExecutor)

      expect(result).toEqual({
        total: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      })
      expect(mockExecutor).not.toHaveBeenCalled()
    })
  })
})
