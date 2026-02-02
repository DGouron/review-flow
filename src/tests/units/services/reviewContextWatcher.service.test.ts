import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReviewContextWatcherService } from '../../../services/reviewContextWatcher.service.js'
import { StubReviewContextGateway } from '../../stubs/reviewContextGateway.stub.js'
import { ReviewContextFactory } from '../../factories/reviewContext.factory.js'

describe('ReviewContextWatcherService', () => {
  let gateway: StubReviewContextGateway
  let watcher: ReviewContextWatcherService

  beforeEach(() => {
    vi.useFakeTimers()
    gateway = new StubReviewContextGateway()
    watcher = new ReviewContextWatcherService(gateway)
  })

  afterEach(() => {
    watcher.stopAll()
    vi.useRealTimers()
  })

  it('should call callback when progress changes in context file', async () => {
    const mergeRequestId = 'github-owner-repo-42'
    const localPath = '/tmp/repo'
    const receivedProgress: Array<{ phase: string; currentStep: string | null }> = []

    const initialContext = ReviewContextFactory.create({ mergeRequestId })
    gateway.setContext(mergeRequestId, initialContext)

    watcher.start(localPath, mergeRequestId, (progress) => {
      receivedProgress.push({ phase: progress.phase, currentStep: progress.currentStep })
    })

    gateway.updateContextProgress(mergeRequestId, {
      phase: 'agents-running',
      currentStep: 'verify',
      stepsCompleted: ['context'],
    })

    await vi.advanceTimersByTimeAsync(600)

    expect(receivedProgress).toContainEqual({
      phase: 'agents-running',
      currentStep: 'verify',
    })

    watcher.stop(mergeRequestId)
  })

  it('should not call callback when progress has not changed', async () => {
    const mergeRequestId = 'github-owner-repo-42'
    const localPath = '/tmp/repo'
    let callCount = 0

    const context = ReviewContextFactory.createInProgress('verify', ['context'])
    gateway.setContext(mergeRequestId, context)

    watcher.start(localPath, mergeRequestId, () => {
      callCount++
    })

    // Advance through 3 polling intervals without changing progress
    await vi.advanceTimersByTimeAsync(1600)

    // Should only be called once (initial detection)
    expect(callCount).toBe(1)

    watcher.stop(mergeRequestId)
  })

  it('should stop polling when progress phase is completed', async () => {
    const mergeRequestId = 'github-owner-repo-42'
    const localPath = '/tmp/repo'
    let callCount = 0

    const context = ReviewContextFactory.createInProgress('verify', ['context'])
    gateway.setContext(mergeRequestId, context)

    watcher.start(localPath, mergeRequestId, () => {
      callCount++
    })

    await vi.advanceTimersByTimeAsync(600)
    expect(callCount).toBe(1)

    gateway.updateContextProgress(mergeRequestId, {
      phase: 'completed',
      currentStep: null,
      stepsCompleted: ['context', 'verify', 'scan', 'threads', 'report'],
    })

    await vi.advanceTimersByTimeAsync(600)
    expect(callCount).toBe(2)

    await vi.advanceTimersByTimeAsync(1000)
    expect(callCount).toBe(2)

    expect(watcher.isWatching(mergeRequestId)).toBe(false)
  })

  it('should not crash when context file does not exist', async () => {
    const mergeRequestId = 'github-owner-repo-99'
    const localPath = '/tmp/repo'
    let callCount = 0

    watcher.start(localPath, mergeRequestId, () => {
      callCount++
    })

    await vi.advanceTimersByTimeAsync(1600)

    expect(callCount).toBe(0)
    expect(watcher.isWatching(mergeRequestId)).toBe(true)

    gateway.setContext(mergeRequestId, ReviewContextFactory.createInProgress('scan', ['context', 'verify']))

    await vi.advanceTimersByTimeAsync(600)

    expect(callCount).toBe(1)

    watcher.stop(mergeRequestId)
  })
})
