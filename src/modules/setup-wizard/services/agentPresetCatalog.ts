import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import {
  DEFAULT_BACK_AGENTS,
  DEFAULT_FRONT_AGENTS,
  DEFAULT_FULLSTACK_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { Preset } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

// Reuses the same agent catalog the review engine falls back to
// (see getProjectAgentsOrFocusDefaults / DEFAULT_AGENTS) so a project
// configured through this wizard ends up with an agent list the engine
// actually recognizes, pipeline stages ('threads', 'report') included.
const PRESET_AGENTS: Record<Preset, AgentDefinition[]> = {
  backend: DEFAULT_BACK_AGENTS,
  frontend: DEFAULT_FRONT_AGENTS,
  fullstack: DEFAULT_FULLSTACK_AGENTS,
  basic: [],
  custom: [],
};

// Pipeline-internal stages, appended automatically to a custom selection —
// not meaningful as a user-pickable "review dimension".
const PIPELINE_AGENTS: AgentDefinition[] = [
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

function dedupByName(agents: AgentDefinition[]): AgentDefinition[] {
  const byName = new Map(agents.map((agent) => [agent.name, agent]));
  return [...byName.values()];
}

const FULL_CATALOG: AgentDefinition[] = dedupByName([
  ...DEFAULT_BACK_AGENTS,
  ...DEFAULT_FRONT_AGENTS,
]).filter((agent) => !PIPELINE_AGENTS.some((pipeline) => pipeline.name === agent.name));

export function getAgentsForPreset(preset: Preset): AgentDefinition[] {
  return [...PRESET_AGENTS[preset]];
}

export function getFullAgentCatalog(): AgentDefinition[] {
  return [...FULL_CATALOG];
}

export function buildCustomAgents(selectedNames: string[]): AgentDefinition[] {
  const catalogByName = new Map(FULL_CATALOG.map((agent) => [agent.name, agent]));
  const selected = selectedNames
    .map((name) => catalogByName.get(name))
    .filter((agent): agent is AgentDefinition => Boolean(agent));
  return dedupByName([...selected, ...PIPELINE_AGENTS]);
}
