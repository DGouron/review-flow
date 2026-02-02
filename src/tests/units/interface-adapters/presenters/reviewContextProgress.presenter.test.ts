import { describe, it, expect } from 'vitest'
import { ReviewContextProgressPresenter } from '../../../../interface-adapters/presenters/reviewContextProgress.presenter.js'
import type { ReviewContextProgress } from '../../../../entities/reviewContext/reviewContext.js'

describe('ReviewContextProgressPresenter', () => {
  const presenter = new ReviewContextProgressPresenter()

  it('should map context progress to review progress with completed and running steps', () => {
    const contextProgress: ReviewContextProgress = {
      phase: 'agents-running',
      currentStep: 'scan',
      stepsCompleted: ['context', 'verify'],
      updatedAt: '2026-02-02T10:02:00Z',
    }

    const result = presenter.toReviewProgress(contextProgress)

    expect(result.currentPhase).toBe('agents-running')
    expect(result.agents).toHaveLength(5)

    const contextAgent = result.agents.find(a => a.name === 'context')
    expect(contextAgent?.status).toBe('completed')

    const verifyAgent = result.agents.find(a => a.name === 'verify')
    expect(verifyAgent?.status).toBe('completed')

    const scanAgent = result.agents.find(a => a.name === 'scan')
    expect(scanAgent?.status).toBe('running')

    const threadsAgent = result.agents.find(a => a.name === 'threads')
    expect(threadsAgent?.status).toBe('pending')

    expect(result.overallProgress).toBeGreaterThan(0)
    expect(result.overallProgress).toBeLessThan(100)
  })

  it('should return 100% progress when phase is completed', () => {
    const contextProgress: ReviewContextProgress = {
      phase: 'completed',
      currentStep: null,
      stepsCompleted: ['context', 'verify', 'scan', 'threads', 'report'],
    }

    const result = presenter.toReviewProgress(contextProgress)

    expect(result.currentPhase).toBe('completed')
    expect(result.overallProgress).toBe(100)
    expect(result.agents.every(a => a.status === 'completed')).toBe(true)
  })
})
