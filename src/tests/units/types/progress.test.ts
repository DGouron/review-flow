import {
  createInitialProgress,
  calculateOverallProgress,
  DEFAULT_AGENTS,
  type ReviewProgress,
  type AgentDefinition,
  type AgentStatus,
  type ReviewPhase,
} from '../../../types/progress.js'

describe('createInitialProgress', () => {
  describe('with default agents', () => {
    it('should create progress with all default agents pending', () => {
      const progress = createInitialProgress()

      expect(progress.agents).toHaveLength(DEFAULT_AGENTS.length)
      expect(progress.agents.every(a => a.status === 'pending')).toBe(true)
    })

    it('should start in initializing phase', () => {
      const progress = createInitialProgress()

      expect(progress.currentPhase).toBe('initializing')
    })

    it('should start with 0% progress', () => {
      const progress = createInitialProgress()

      expect(progress.overallProgress).toBe(0)
    })

    it('should have lastUpdate set', () => {
      const progress = createInitialProgress()

      expect(progress.lastUpdate).toBeInstanceOf(Date)
    })
  })

  describe('with custom agents', () => {
    it('should create progress with custom agents', () => {
      const customAgents: AgentDefinition[] = [
        { name: 'security', displayName: 'Security' },
        { name: 'quality', displayName: 'Quality' },
        { name: 'perf', displayName: 'Performance' },
      ]

      const progress = createInitialProgress(customAgents)

      expect(progress.agents).toHaveLength(3)
      expect(progress.agents.map(a => a.name)).toEqual(['security', 'quality', 'perf'])
    })

    it('should preserve display names', () => {
      const customAgents: AgentDefinition[] = [
        { name: 'test-agent', displayName: 'Test Agent' },
      ]

      const progress = createInitialProgress(customAgents)

      expect(progress.agents[0].displayName).toBe('Test Agent')
    })
  })

  describe('with empty agents array', () => {
    it('should create progress with no agents', () => {
      const progress = createInitialProgress([])

      expect(progress.agents).toHaveLength(0)
    })
  })
})

describe('calculateOverallProgress', () => {
  function createProgress(
    agentStatuses: AgentStatus[],
    phase: ReviewPhase
  ): ReviewProgress {
    return {
      agents: agentStatuses.map((status, index) => ({
        name: `agent-${index}`,
        displayName: `Agent ${index}`,
        status,
      })),
      currentPhase: phase,
      overallProgress: 0,
      lastUpdate: new Date(),
    }
  }

  describe('with all agents pending', () => {
    it('should return 0% at initializing phase', () => {
      const progress = createProgress(
        ['pending', 'pending', 'pending', 'pending'],
        'initializing'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(0)
    })

    it('should return phase contribution only', () => {
      const progress = createProgress(
        ['pending', 'pending'],
        'agents-running'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(5)
    })
  })

  describe('with some agents completed', () => {
    it('should calculate based on completed ratio', () => {
      const progress = createProgress(
        ['completed', 'completed', 'pending', 'pending'],
        'agents-running'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(45)
    })

    it('should count running agents as 50%', () => {
      const progress = createProgress(
        ['running', 'running', 'pending', 'pending'],
        'agents-running'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(25)
    })
  })

  describe('with all agents completed', () => {
    it('should return 80% + phase contribution', () => {
      const progress = createProgress(
        ['completed', 'completed'],
        'synthesizing'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(90)
    })

    it('should return 100% when phase is completed', () => {
      const progress = createProgress(
        ['completed', 'completed'],
        'completed'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(100)
    })
  })

  describe('with failed agents', () => {
    it('should count failed agents as done', () => {
      const progress = createProgress(
        ['completed', 'failed', 'pending', 'pending'],
        'agents-running'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(45)
    })
  })

  describe('with zero agents', () => {
    it('should return 0 to avoid division by zero', () => {
      const progress = createProgress([], 'agents-running')

      const result = calculateOverallProgress(progress)

      expect(result).toBe(0)
    })
  })

  describe('phase contributions', () => {
    it('should add correct phase percentages', () => {
      const phases: Array<{ phase: ReviewPhase; expected: number }> = [
        { phase: 'initializing', expected: 0 },
        { phase: 'agents-running', expected: 5 },
        { phase: 'synthesizing', expected: 10 },
        { phase: 'publishing', expected: 15 },
        { phase: 'completed', expected: 20 },
      ]

      for (const { phase, expected } of phases) {
        const progress = createProgress(['pending'], phase)
        const result = calculateOverallProgress(progress)
        expect(result).toBe(expected)
      }
    })
  })

  describe('mixed scenarios', () => {
    it('should handle realistic scenario', () => {
      const progress = createProgress(
        ['completed', 'completed', 'running', 'pending'],
        'synthesizing'
      )

      const result = calculateOverallProgress(progress)

      expect(result).toBe(60)
    })
  })
})
