import { describe, it, expect, vi } from 'vitest'
import { GitLabReviewActionCliGateway } from '../../../../../interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js'
import type { ReviewAction } from '../../../../../entities/reviewAction/reviewAction.js'

describe('GitLabReviewActionCliGateway', () => {
  it('should execute THREAD_RESOLVE action with correct glab command', async () => {
    const executor = vi.fn()
    const gateway = new GitLabReviewActionCliGateway(executor)

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: 'abc123' }
    ]
    const context = {
      projectPath: 'mentor-goal/main-app',
      mrNumber: 4658,
      localPath: '/tmp/repo',
    }

    const result = await gateway.execute(actions, context)

    expect(executor).toHaveBeenCalledWith(
      'glab',
      expect.arrayContaining(['resolved=true']),
      '/tmp/repo'
    )
    expect(result.succeeded).toBe(1)
  })

  it('should execute POST_COMMENT action', async () => {
    const executor = vi.fn()
    const gateway = new GitLabReviewActionCliGateway(executor)
    const actions: ReviewAction[] = [{ type: 'POST_COMMENT', body: '## Review done' }]
    const context = { projectPath: 'group/project', mrNumber: 123, localPath: '/tmp' }

    const result = await gateway.execute(actions, context)

    expect(executor).toHaveBeenCalledWith('glab', expect.arrayContaining(['body=## Review done']), '/tmp')
    expect(result.succeeded).toBe(1)
  })

  it('should execute THREAD_REPLY action', async () => {
    const executor = vi.fn()
    const gateway = new GitLabReviewActionCliGateway(executor)
    const actions: ReviewAction[] = [{ type: 'THREAD_REPLY', threadId: 'abc', message: 'Fixed!' }]
    const context = { projectPath: 'group/project', mrNumber: 123, localPath: '/tmp' }

    const result = await gateway.execute(actions, context)

    expect(executor).toHaveBeenCalledWith('glab', expect.arrayContaining(['body=Fixed!']), '/tmp')
    expect(result.succeeded).toBe(1)
  })

  it('should execute ADD_LABEL action', async () => {
    const executor = vi.fn()
    const gateway = new GitLabReviewActionCliGateway(executor)
    const actions: ReviewAction[] = [{ type: 'ADD_LABEL', label: 'needs-review' }]
    const context = { projectPath: 'group/project', mrNumber: 123, localPath: '/tmp' }

    const result = await gateway.execute(actions, context)

    expect(executor).toHaveBeenCalledWith('glab', expect.arrayContaining(['add_labels=needs-review']), '/tmp')
    expect(result.succeeded).toBe(1)
  })

  it('should skip FETCH_THREADS action', async () => {
    const executor = vi.fn()
    const gateway = new GitLabReviewActionCliGateway(executor)
    const actions: ReviewAction[] = [{ type: 'FETCH_THREADS' }]
    const context = { projectPath: 'group/project', mrNumber: 123, localPath: '/tmp' }

    const result = await gateway.execute(actions, context)

    expect(executor).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })
})
