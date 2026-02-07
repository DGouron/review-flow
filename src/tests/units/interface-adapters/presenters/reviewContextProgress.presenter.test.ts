import { describe, it, expect } from 'vitest'
import { ReviewContextProgressPresenter } from '../../../../interface-adapters/presenters/reviewContextProgress.presenter.js'
import type { ReviewContextProgress } from '../../../../entities/reviewContext/reviewContext.js'

describe('ReviewContextProgressPresenter', () => {
  const presenter = new ReviewContextProgressPresenter()

  it('should fallback to DEFAULT_FOLLOWUP_AGENTS when no agents in context', () => {
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

  it('should use agents from context when provided', () => {
    const contextProgress: ReviewContextProgress = {
      phase: 'agents-running',
      currentStep: 'ddd',
      stepsCompleted: ['clean-architecture'],
      agents: [
        { name: 'clean-architecture', displayName: 'Clean Archi' },
        { name: 'ddd', displayName: 'DDD' },
        { name: 'react-best-practices', displayName: 'React' },
        { name: 'solid', displayName: 'SOLID' },
        { name: 'testing', displayName: 'Testing' },
        { name: 'code-quality', displayName: 'Code Quality' },
      ],
      updatedAt: '2026-02-06T10:00:00Z',
    }

    const result = presenter.toReviewProgress(contextProgress)

    expect(result.agents).toHaveLength(6)

    const cleanArchi = result.agents.find(a => a.name === 'clean-architecture')
    expect(cleanArchi?.status).toBe('completed')
    expect(cleanArchi?.displayName).toBe('Clean Archi')

    const ddd = result.agents.find(a => a.name === 'ddd')
    expect(ddd?.status).toBe('running')
    expect(ddd?.displayName).toBe('DDD')

    const react = result.agents.find(a => a.name === 'react-best-practices')
    expect(react?.status).toBe('pending')

    expect(result.overallProgress).toBeGreaterThan(0)
    expect(result.overallProgress).toBeLessThan(100)
  })

  it('should use custom agents from project config', () => {
    const contextProgress: ReviewContextProgress = {
      phase: 'agents-running',
      currentStep: 'perf-audit',
      stepsCompleted: ['security-audit'],
      agents: [
        { name: 'security-audit', displayName: 'Security' },
        { name: 'perf-audit', displayName: 'Performance' },
      ],
    }

    const result = presenter.toReviewProgress(contextProgress)

    expect(result.agents).toHaveLength(2)
    expect(result.agents[0].name).toBe('security-audit')
    expect(result.agents[0].status).toBe('completed')
    expect(result.agents[1].name).toBe('perf-audit')
    expect(result.agents[1].status).toBe('running')
  })
})
