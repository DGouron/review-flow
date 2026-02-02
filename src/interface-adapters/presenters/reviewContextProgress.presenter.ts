import type { ReviewContextProgress } from '../../entities/reviewContext/reviewContext.js'
import type { ReviewProgress, ReviewPhase, AgentProgress } from '../../types/progress.js'
import { DEFAULT_FOLLOWUP_AGENTS, calculateOverallProgress } from '../../types/progress.js'

export class ReviewContextProgressPresenter {
  toReviewProgress(contextProgress: ReviewContextProgress): ReviewProgress {
    const stepsCompleted = contextProgress.stepsCompleted ?? []
    const currentStep = contextProgress.currentStep

    const agents: AgentProgress[] = DEFAULT_FOLLOWUP_AGENTS.map(agent => {
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

  private mapPhase(phase: ReviewContextProgress['phase']): ReviewPhase {
    if (phase === 'pending') {
      return 'initializing'
    }
    return phase
  }
}
