import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeActionsFromContext } from '../../../services/contextActionsExecutor.js'
import type { ReviewContext } from '../../../entities/reviewContext/reviewContext.js'

describe('executeActionsFromContext', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  const mockExecutor = vi.fn()

  const baseContext: ReviewContext = {
    version: '1.0',
    mergeRequestId: 'github-owner/repo-42',
    platform: 'github',
    projectPath: 'owner/repo',
    mergeRequestNumber: 42,
    createdAt: '2026-02-02T10:00:00Z',
    threads: [],
    actions: [],
    progress: { phase: 'completed', currentStep: null },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty result when no actions in context', async () => {
    const context = { ...baseContext, actions: [] }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(0)
    expect(result.succeeded).toBe(0)
    expect(mockExecutor).not.toHaveBeenCalled()
  })

  it('should execute THREAD_RESOLVE action via GitHub API', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'PRRT_kwDONxxx' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['api', 'graphql']),
      '/tmp/repo'
    )
  })

  it('should execute POST_COMMENT action', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'POST_COMMENT', body: '## Follow-up Review\n\nAll fixed.' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repos/owner/repo/issues/42/comments']),
      '/tmp/repo'
    )
  })

  it('should execute ADD_LABEL action', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'ADD_LABEL', label: 'needs_approve' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repos/owner/repo/issues/42/labels']),
      '/tmp/repo'
    )
  })

  it('should execute multiple actions in order', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'thread-1' },
        { type: 'THREAD_RESOLVE', threadId: 'thread-2' },
        { type: 'POST_COMMENT', body: 'Done' },
        { type: 'ADD_LABEL', label: 'approved' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(4)
    expect(result.succeeded).toBe(4)
    expect(mockExecutor).toHaveBeenCalledTimes(4)
  })

  it('should handle GitLab platform', async () => {
    const context: ReviewContext = {
      ...baseContext,
      platform: 'gitlab',
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'abc123' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledWith(
      'glab',
      expect.arrayContaining(['api']),
      '/tmp/repo'
    )
  })

  it('should continue executing when one action fails', async () => {
    mockExecutor.mockImplementationOnce(() => {
      throw new Error('API error')
    })

    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'thread-1' },
        { type: 'POST_COMMENT', body: 'Done' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.succeeded).toBe(1)
  })
})
