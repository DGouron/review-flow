import type { ReviewContextProgress, ReviewContextAgent } from '../../entities/reviewContext/reviewContext.js'
import type { ReviewProgress, ReviewPhase, AgentProgress } from '../../entities/progress/progress.type.js'
import { DEFAULT_FOLLOWUP_AGENTS } from '../../entities/progress/agentDefinition.type.js'
import { calculateOverallProgress } from '../../entities/progress/progress.calculator.js'

export class ReviewContextProgressPresenter {
  toReviewProgress(contextProgress: ReviewContextProgress): ReviewProgress {
    const stepsCompleted = contextProgress.stepsCompleted ?? []
    const currentStep = contextProgress.currentStep

    const agentDefinitions = this.resolveAgents(contextProgress)

    const agents: AgentProgress[] = agentDefinitions.map(agent => {
      let status: AgentProgress['status'] = 'pending'

      if (stepsCompleted.includes(agent.name)) {
        status = 'completed'
      } else if (currentStep === agent.name) {
        status = 'running'
      }

      return {
        name: agent.name,
        displayName: agent.displayName,
        status,
      }
    })

    const phase = this.mapPhase(contextProgress.phase)

    const progress: ReviewProgress = {
      agents,
      currentPhase: phase,
      overallProgress: 0,
      lastUpdate: contextProgress.updatedAt ? new Date(contextProgress.updatedAt) : new Date(),
    }

    progress.overallProgress = phase === 'completed' ? 100 : calculateOverallProgress(progress)

    return progress
  }

  private resolveAgents(contextProgress: ReviewContextProgress): ReviewContextAgent[] {
    if (contextProgress.agents && contextProgress.agents.length > 0) {
      return contextProgress.agents
    }
    return DEFAULT_FOLLOWUP_AGENTS
  }

  private mapPhase(phase: ReviewContextProgress['phase']): ReviewPhase {
    if (phase === 'pending') {
      return 'initializing'
    }
    return phase
  }
}
