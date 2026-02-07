import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../queue/reviewQueue.js', () => ({
  setProgressChangeCallback: vi.fn(),
  setStateChangeCallback: vi.fn(),
  updateJobProgress: vi.fn(),
  getJobsStatus: vi.fn(() => ({ active: [], recent: [] })),
}))

vi.mock('../../../services/logService.js', () => ({
  onLog: vi.fn(),
}))

import {
  setupWebSocketCallbacks,
  startWatchingReviewContext,
  stopWatchingReviewContext,
} from '../../../main/websocket.js'
import { updateJobProgress } from '../../../queue/reviewQueue.js'
import type { ReviewContextProgress } from '../../../entities/reviewContext/reviewContext.js'
import type { ReviewProgress } from '../../../entities/progress/progress.type.js'

function createMockDeps() {
  return {
    reviewContextWatcher: {
      start: vi.fn(),
      stop: vi.fn(),
      stopAll: vi.fn(),
      isWatching: vi.fn(),
    },
    progressPresenter: {
      toReviewProgress: vi.fn(),
    },
  }
}

describe('startWatchingReviewContext', () => {
  it('should delegate to watcher.start with correct arguments', () => {
    const deps = createMockDeps()
    setupWebSocketCallbacks(deps as never)

    startWatchingReviewContext('job-123', '/tmp/repo', 'gitlab-project-42')

    expect(deps.reviewContextWatcher.start).toHaveBeenCalledWith(
      '/tmp/repo',
      'gitlab-project-42',
      expect.any(Function),
    )
  })

  it('should transform context progress and update job progress in callback', () => {
    const deps = createMockDeps()
    setupWebSocketCallbacks(deps as never)

    const fakeReviewProgress: ReviewProgress = {
      agents: [],
      currentPhase: 'agents-running',
      overallProgress: 50,
      lastUpdate: new Date(),
    }
    deps.progressPresenter.toReviewProgress.mockReturnValue(fakeReviewProgress)

    startWatchingReviewContext('job-456', '/tmp/repo', 'gitlab-project-42')

    const callback = deps.reviewContextWatcher.start.mock.calls[0][2]
    const contextProgress: ReviewContextProgress = {
      phase: 'agents-running',
      currentStep: 'verify',
      stepsCompleted: ['context'],
    }
    callback(contextProgress)

    expect(deps.progressPresenter.toReviewProgress).toHaveBeenCalledWith(contextProgress)
    expect(updateJobProgress).toHaveBeenCalledWith('job-456', fakeReviewProgress)
  })
})

describe('stopWatchingReviewContext', () => {
  it('should delegate to watcher.stop', () => {
    const deps = createMockDeps()
    setupWebSocketCallbacks(deps as never)

    stopWatchingReviewContext('gitlab-project-42')

    expect(deps.reviewContextWatcher.stop).toHaveBeenCalledWith('gitlab-project-42')
  })
})
