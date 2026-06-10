import type { ReviewPhase, ReviewProgress } from './progress.type.js';

export function calculateOverallProgress(progress: ReviewProgress): number {
  const agentCount = progress.agents.length;
  if (agentCount === 0) return 0;

  const completedAgents = progress.agents.filter(
    (a) => a.status === 'completed' || a.status === 'failed',
  ).length;
  const runningAgents = progress.agents.filter((a) => a.status === 'running').length;

  const agentProgress = ((completedAgents + runningAgents * 0.5) / agentCount) * 80;

  const phaseProgress: Record<ReviewPhase, number> = {
    initializing: 0,
    'agents-running': 5,
    synthesizing: 10,
    publishing: 15,
    completed: 20,
  };

  return Math.round(agentProgress + phaseProgress[progress.currentPhase]);
}
