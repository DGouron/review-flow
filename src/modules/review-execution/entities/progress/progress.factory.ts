import type { AgentDefinition } from './agentDefinition.type.js';
import { DEFAULT_AGENTS } from './agentDefinition.type.js';
import type { ReviewProgress } from './progress.type.js';

export function createInitialProgress(customAgents?: AgentDefinition[]): ReviewProgress {
  const agents = customAgents ?? DEFAULT_AGENTS;
  return {
    agents: agents.map((agent) => ({
      name: agent.name,
      displayName: agent.displayName,
      status: 'pending',
    })),
    currentPhase: 'initializing',
    overallProgress: 0,
    lastUpdate: new Date(),
  };
}
