/**
 * Progress tracking types for real-time review monitoring
 */

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ReviewPhase = 'initializing' | 'agents-running' | 'synthesizing' | 'publishing' | 'completed';

export interface AgentProgress {
  name: string;
  displayName: string;
  status: AgentStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ReviewProgress {
  agents: AgentProgress[];
  currentPhase: ReviewPhase;
  overallProgress: number; // 0-100
  lastUpdate: Date;
}

export type ProgressEventType = 'agent:started' | 'agent:completed' | 'agent:failed' | 'phase:changed';

export interface ProgressEvent {
  type: ProgressEventType;
  jobId: string;
  timestamp: Date;
  data: {
    agentName?: string;
    phase?: ReviewPhase;
    error?: string;
  };
}

/**
 * Default agents for code review
 */
export const DEFAULT_AGENTS: Array<{ name: string; displayName: string }> = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
];

/**
 * Create initial progress state with all agents pending
 */
export function createInitialProgress(): ReviewProgress {
  return {
    agents: DEFAULT_AGENTS.map(agent => ({
      name: agent.name,
      displayName: agent.displayName,
      status: 'pending' as AgentStatus,
    })),
    currentPhase: 'initializing',
    overallProgress: 0,
    lastUpdate: new Date(),
  };
}

/**
 * Calculate overall progress based on agent states
 */
export function calculateOverallProgress(progress: ReviewProgress): number {
  const agentCount = progress.agents.length;
  if (agentCount === 0) return 0;

  const completedAgents = progress.agents.filter(
    a => a.status === 'completed' || a.status === 'failed'
  ).length;
  const runningAgents = progress.agents.filter(a => a.status === 'running').length;

  // Completed agents contribute 100%, running contribute 50%
  const agentProgress = ((completedAgents + runningAgents * 0.5) / agentCount) * 80; // Agents = 80%

  // Phase-based progress for remaining 20%
  const phaseProgress: Record<ReviewPhase, number> = {
    'initializing': 0,
    'agents-running': 5,
    'synthesizing': 10,
    'publishing': 15,
    'completed': 20,
  };

  return Math.round(agentProgress + phaseProgress[progress.currentPhase]);
}
