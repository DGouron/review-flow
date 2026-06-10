import {
  type AgentDefinition,
  DEFAULT_FRONT_AGENTS,
  DEFAULT_BACK_AGENTS,
  DEFAULT_FULLSTACK_AGENTS,
  DEFAULT_DOC_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';

export const REVIEW_FOCUS_VALUES = ['front', 'back', 'fullstack', 'doc'] as const;

export type ReviewFocus = (typeof REVIEW_FOCUS_VALUES)[number];

export function isReviewFocus(value: unknown): value is ReviewFocus {
  if (typeof value !== 'string') {
    return false;
  }
  return REVIEW_FOCUS_VALUES.some((focus) => focus === value);
}

export function reviewSkillForFocus(focus: ReviewFocus): string {
  return `review-${focus}`;
}

const FOCUS_TO_AGENTS: Record<ReviewFocus, AgentDefinition[]> = {
  front: DEFAULT_FRONT_AGENTS,
  back: DEFAULT_BACK_AGENTS,
  fullstack: DEFAULT_FULLSTACK_AGENTS,
  doc: DEFAULT_DOC_AGENTS,
};

export function defaultAgentsForFocus(focus: ReviewFocus): AgentDefinition[] {
  return FOCUS_TO_AGENTS[focus];
}

export function dedupAgents(agents: AgentDefinition[]): AgentDefinition[] {
  const seen = new Map<string, AgentDefinition>();
  for (const agent of agents) {
    if (!seen.has(agent.name)) {
      seen.set(agent.name, agent);
    }
  }
  return [...seen.values()];
}
