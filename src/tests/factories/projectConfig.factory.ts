import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';

export interface ProjectConfigOverrides {
  github?: boolean;
  gitlab?: boolean;
  defaultModel?: 'haiku' | 'sonnet' | 'opus';
  reviewSkill?: string;
  reviewFollowupSkill?: string;
  reviewFocus?: string;
  language?: 'en' | 'fr';
  retentionDays?: number;
  agents?: AgentDefinition[];
  followupAgents?: AgentDefinition[];
  routingPolicy?: { haikuMaxLines: number; sonnetMaxLines: number };
  qualityThreshold?: number;
  review?: Record<string, unknown>;
}

function buildPayload(overrides: ProjectConfigOverrides): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    github: overrides.github ?? true,
    gitlab: overrides.gitlab ?? false,
    defaultModel: overrides.defaultModel ?? 'sonnet',
    reviewFollowupSkill: overrides.reviewFollowupSkill ?? 'review-followup',
  };

  if (Object.prototype.hasOwnProperty.call(overrides, 'reviewSkill')) {
    if (overrides.reviewSkill !== undefined) {
      payload.reviewSkill = overrides.reviewSkill;
    }
  } else {
    payload.reviewSkill = 'review-front';
  }

  if (Object.prototype.hasOwnProperty.call(overrides, 'reviewFocus')) {
    if (overrides.reviewFocus !== undefined) {
      payload.reviewFocus = overrides.reviewFocus;
    }
  }

  if (overrides.language !== undefined) {
    payload.language = overrides.language;
  }
  if (overrides.retentionDays !== undefined) {
    payload.retentionDays = overrides.retentionDays;
  }
  if (overrides.agents !== undefined) {
    payload.agents = overrides.agents;
  }
  if (overrides.followupAgents !== undefined) {
    payload.followupAgents = overrides.followupAgents;
  }
  if (overrides.routingPolicy !== undefined) {
    payload.routingPolicy = overrides.routingPolicy;
  }
  if (overrides.qualityThreshold !== undefined) {
    payload.qualityThreshold = overrides.qualityThreshold;
  }
  if (overrides.review !== undefined) {
    payload.review = overrides.review;
  }

  return payload;
}

export const ProjectConfigFactory = {
  create(overrides: ProjectConfigOverrides = {}): Record<string, unknown> {
    return buildPayload(overrides);
  },
};
