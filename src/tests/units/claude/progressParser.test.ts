import { ProgressParser, parseProgressMarkers } from '../../../claude/progressParser.js'
import type { AgentDefinition, ProgressEvent } from '../../../types/progress.js'

describe('ProgressParser', () => {
  const testAgents: AgentDefinition[] = [
    { name: 'security', displayName: 'Security' },
    { name: 'quality', displayName: 'Quality' },
  ]

  describe('parseChunk - agent markers', () => {
    it('should detect agent started marker', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const events = parser.parseChunk('[PROGRESS:security:started] Analyzing code...')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent:started')
      expect(events[0].data.agentName).toBe('security')

      const progress = parser.getProgress()
      const securityAgent = progress.agents.find(a => a.name === 'security')
      expect(securityAgent?.status).toBe('running')
      expect(securityAgent?.startedAt).toBeInstanceOf(Date)
    })

    it('should detect agent completed marker', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      parser.parseChunk('[PROGRESS:security:started]')

      const events = parser.parseChunk('[PROGRESS:security:completed]')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent:completed')

      const progress = parser.getProgress()
      const securityAgent = progress.agents.find(a => a.name === 'security')
      expect(securityAgent?.status).toBe('completed')
      expect(securityAgent?.completedAt).toBeInstanceOf(Date)
    })

    it('should detect agent failed marker with error message', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      parser.parseChunk('[PROGRESS:security:started]')

      const events = parser.parseChunk('[PROGRESS:security:failed:Connection timeout]')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('agent:failed')
      expect(events[0].data.error).toBe('Connection timeout')

      const progress = parser.getProgress()
      const securityAgent = progress.agents.find(a => a.name === 'security')
      expect(securityAgent?.status).toBe('failed')
      expect(securityAgent?.error).toBe('Connection timeout')
    })

    it('should ignore unknown status', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const events = parser.parseChunk('[PROGRESS:security:unknown]')

      expect(events).toHaveLength(0)
    })
  })

  describe('parseChunk - phase markers', () => {
    it('should detect phase change', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const events = parser.parseChunk('[PHASE:agents-running]')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('phase:changed')
      expect(events[0].data.phase).toBe('agents-running')

      const progress = parser.getProgress()
      expect(progress.currentPhase).toBe('agents-running')
    })

    it('should not emit event for same phase', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      parser.parseChunk('[PHASE:agents-running]')

      const events = parser.parseChunk('[PHASE:agents-running]')

      expect(events).toHaveLength(0)
    })

    it('should track all valid phases', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      const phases = ['initializing', 'agents-running', 'synthesizing', 'publishing', 'completed']

      for (const phase of phases) {
        const events = parser.parseChunk(`[PHASE:${phase}]`)
        if (phase !== 'initializing') {
          expect(events).toHaveLength(1)
        }
        expect(parser.getProgress().currentPhase).toBe(phase)
      }
    })
  })

  describe('parseChunk - multiple markers', () => {
    it('should handle multiple markers in one chunk', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const events = parser.parseChunk(`
        [PROGRESS:security:started]
        [PROGRESS:quality:started]
        [PHASE:agents-running]
      `)

      expect(events).toHaveLength(3)
      expect(events.map(e => e.type)).toContain('agent:started')
      expect(events.map(e => e.type)).toContain('phase:changed')
    })
  })

  describe('parseChunk - dynamic agent addition', () => {
    it('should add unknown agent dynamically', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const events = parser.parseChunk('[PROGRESS:performance:started]')

      expect(events).toHaveLength(1)
      expect(events[0].data.agentName).toBe('performance')

      const progress = parser.getProgress()
      const newAgent = progress.agents.find(a => a.name === 'performance')
      expect(newAgent).toBeDefined()
      expect(newAgent?.status).toBe('running')
      expect(newAgent?.displayName).toBe('Performance')
    })

    it('should format kebab-case agent names to Title Case', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      parser.parseChunk('[PROGRESS:code-style-checker:started]')

      const progress = parser.getProgress()
      const newAgent = progress.agents.find(a => a.name === 'code-style-checker')
      expect(newAgent?.displayName).toBe('Code Style Checker')
    })
  })

  describe('parseChunk - callback invocation', () => {
    it('should invoke callback for each event', () => {
      const events: ProgressEvent[] = []
      const callback = vi.fn((event: ProgressEvent) => {
        events.push(event)
      })

      const parser = new ProgressParser('job-1', callback, testAgents)
      parser.parseChunk('[PROGRESS:security:started]')

      expect(callback).toHaveBeenCalledTimes(1)
      expect(events[0].type).toBe('agent:started')
    })
  })

  describe('getProgress', () => {
    it('should return initial progress with all agents pending', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const progress = parser.getProgress()

      expect(progress.agents).toHaveLength(2)
      expect(progress.agents.every(a => a.status === 'pending')).toBe(true)
      expect(progress.currentPhase).toBe('initializing')
      expect(progress.overallProgress).toBe(0)
    })

    it('should return a copy of progress (immutability)', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      const progress1 = parser.getProgress()
      const progress2 = parser.getProgress()

      expect(progress1).not.toBe(progress2)
    })
  })

  describe('markAllCompleted', () => {
    it('should mark all agents as completed', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      parser.parseChunk('[PROGRESS:security:started]')

      parser.markAllCompleted()

      const progress = parser.getProgress()
      expect(progress.agents.every(a => a.status === 'completed')).toBe(true)
      expect(progress.currentPhase).toBe('completed')
      expect(progress.overallProgress).toBe(100)
    })
  })

  describe('markFailed', () => {
    it('should mark running agents as failed', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      parser.parseChunk('[PROGRESS:security:started]')

      parser.markFailed('Process terminated')

      const progress = parser.getProgress()
      const securityAgent = progress.agents.find(a => a.name === 'security')
      expect(securityAgent?.status).toBe('failed')
      expect(securityAgent?.error).toBe('Process terminated')
    })

    it('should not affect pending agents', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)
      parser.parseChunk('[PROGRESS:security:started]')

      parser.markFailed('Error')

      const progress = parser.getProgress()
      const qualityAgent = progress.agents.find(a => a.name === 'quality')
      expect(qualityAgent?.status).toBe('pending')
    })
  })

  describe('overallProgress calculation', () => {
    it('should increase progress as agents complete', () => {
      const parser = new ProgressParser('job-1', undefined, testAgents)

      expect(parser.getProgress().overallProgress).toBe(0)

      parser.parseChunk('[PROGRESS:security:started]')
      const progressAfterStart = parser.getProgress().overallProgress
      expect(progressAfterStart).toBeGreaterThan(0)

      parser.parseChunk('[PROGRESS:security:completed]')
      const progressAfterComplete = parser.getProgress().overallProgress
      expect(progressAfterComplete).toBeGreaterThan(progressAfterStart)
    })
  })
})

describe('parseProgressMarkers (utility)', () => {
  it('should parse agent markers without state', () => {
    const result = parseProgressMarkers(`
      [PROGRESS:security:started]
      [PROGRESS:quality:completed]
      [PROGRESS:perf:failed:timeout]
    `)

    expect(result.agents).toHaveLength(3)
    expect(result.agents[0]).toEqual({ name: 'security', status: 'started', error: undefined })
    expect(result.agents[1]).toEqual({ name: 'quality', status: 'completed', error: undefined })
    expect(result.agents[2]).toEqual({ name: 'perf', status: 'failed', error: 'timeout' })
  })

  it('should parse phase markers', () => {
    const result = parseProgressMarkers('[PHASE:synthesizing]')

    expect(result.phases).toEqual(['synthesizing'])
  })

  it('should return empty arrays for no markers', () => {
    const result = parseProgressMarkers('Just regular text output')

    expect(result.agents).toEqual([])
    expect(result.phases).toEqual([])
  })
})
