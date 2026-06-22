import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { logWarn } from '@/frameworks/logging/logBuffer.js';
import {
  MAX_PROJECT_CONCURRENCY_CAP,
  MIN_PROJECT_CONCURRENCY_CAP,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.js';
import type { RoutingPolicy } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';
import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import {
  type ReviewFocus,
  REVIEW_FOCUS_VALUES,
  defaultAgentsForFocus,
  isReviewFocus,
  reviewSkillForFocus,
} from '@/modules/review-execution/entities/progress/reviewFocus.type.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';

export interface ProjectConfig {
  github: boolean;
  gitlab: boolean;
  defaultModel: 'haiku' | 'sonnet' | 'opus';
  reviewSkill: string;
  reviewFollowupSkill: string;
  reviewFocus?: ReviewFocus;
  language: Language;
  retentionDays: number;
  agents?: AgentDefinition[];
  followupAgents?: AgentDefinition[];
  routingPolicy?: RoutingPolicy;
  externalLink?: string;
  qualityThreshold?: number;
  maxConcurrentReviews?: number;
  maxDiffLines?: number;
}

const projectConfigFileSchema = z.record(z.string(), z.unknown());

function parseExternalLink(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

/**
 * Validate agents array structure
 */
const DEFAULT_RETENTION_DAYS = 14;

function parseRetentionDays(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return value;
  }
  return DEFAULT_RETENTION_DAYS;
}

function parseQualityThreshold(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error('Invalid qualityThreshold: must be an integer between 0 and 10');
  }
  return value;
}

function parseMaxDiffLines(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Invalid maxDiffLines: must be a positive integer');
  }
  return value;
}

function parseMaxConcurrentReviews(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_PROJECT_CONCURRENCY_CAP ||
    value > MAX_PROJECT_CONCURRENCY_CAP
  ) {
    throw new Error(
      `Invalid maxConcurrentReviews: must be an integer between ${MIN_PROJECT_CONCURRENCY_CAP} and ${MAX_PROJECT_CONCURRENCY_CAP}`,
    );
  }
  return value;
}

function validateAgents(agents: unknown): agents is AgentDefinition[] {
  if (!Array.isArray(agents)) {
    return false;
  }

  return agents.every((agent) => {
    if (agent === null || typeof agent !== 'object') {
      return false;
    }
    if (!('name' in agent) || !('displayName' in agent)) {
      return false;
    }
    const { name, displayName } = agent;
    return (
      typeof name === 'string' &&
      typeof displayName === 'string' &&
      name.length > 0 &&
      displayName.length > 0
    );
  });
}

function parseRoutingPolicy(value: unknown): RoutingPolicy | undefined {
  if (value === null || value === undefined || typeof value !== 'object') {
    return undefined;
  }
  if (!('haikuMaxLines' in value) || !('sonnetMaxLines' in value)) {
    return undefined;
  }
  const { haikuMaxLines, sonnetMaxLines } = value;
  if (
    typeof haikuMaxLines === 'number' &&
    Number.isInteger(haikuMaxLines) &&
    haikuMaxLines > 0 &&
    typeof sonnetMaxLines === 'number' &&
    Number.isInteger(sonnetMaxLines) &&
    sonnetMaxLines > 0
  ) {
    return { haikuMaxLines, sonnetMaxLines };
  }
  return undefined;
}

function formatReviewFocusValues(): string {
  return REVIEW_FOCUS_VALUES.map((value) => `'${value}'`).join(', ');
}

function parseReviewFocus(value: unknown): ReviewFocus | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isReviewFocus(value)) {
    throw new Error(`Invalid reviewFocus: must be ${formatReviewFocusValues()}`);
  }
  return value;
}

/**
 * Load project configuration from .claude/reviews/config.json
 * @param localPath - Path to the project root directory
 * @returns ProjectConfig or undefined if file doesn't exist
 * @throws Error if file exists but is invalid
 */
export function loadProjectConfig(localPath: string): ProjectConfig | undefined {
  const configPath = join(localPath, '.claude', 'reviews', 'config.json');

  if (!existsSync(configPath)) {
    return undefined;
  }

  const rawContent = readFileSync(configPath, 'utf-8');
  const parsed = projectConfigFileSchema.parse(JSON.parse(rawContent));
  return parseProjectConfig(parsed);
}

/**
 * Pure parsing/validation of an already-loaded JSON object.
 * Throws on missing/invalid fields. Use this when the caller already has
 * the parsed object in memory and wants to avoid re-reading the file.
 */
export function parseProjectConfig(parsed: Record<string, unknown>): ProjectConfig {
  const reviewFocus = parseReviewFocus(parsed.reviewFocus);

  const hasExplicitReviewSkill =
    typeof parsed.reviewSkill === 'string' && parsed.reviewSkill.length > 0;

  // Validate required fields. reviewSkill is required UNLESS a valid reviewFocus is present.
  const baseRequiredFields = ['github', 'gitlab', 'defaultModel', 'reviewFollowupSkill'];
  for (const field of baseRequiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Project config missing required field: ${field}`);
    }
  }
  if (!hasExplicitReviewSkill && reviewFocus === undefined) {
    throw new Error('Project config missing required field: reviewSkill');
  }

  if (hasExplicitReviewSkill && reviewFocus !== undefined) {
    logWarn('Both reviewFocus and reviewSkill set — reviewSkill takes precedence', {
      reviewSkill: parsed.reviewSkill,
      reviewFocus,
    });
  }

  const resolvedReviewSkill =
    hasExplicitReviewSkill || reviewFocus === undefined
      ? String(parsed.reviewSkill)
      : reviewSkillForFocus(reviewFocus);

  // Validate agents if present
  if ('agents' in parsed && parsed.agents !== undefined) {
    if (!validateAgents(parsed.agents)) {
      throw new Error(
        'Invalid agents format: must be array of { name: string, displayName: string }',
      );
    }
  }

  // Validate followupAgents if present
  if ('followupAgents' in parsed && parsed.followupAgents !== undefined) {
    if (!validateAgents(parsed.followupAgents)) {
      throw new Error(
        'Invalid followupAgents format: must be array of { name: string, displayName: string }',
      );
    }
  }

  const config: ProjectConfig = {
    github: Boolean(parsed.github),
    gitlab: Boolean(parsed.gitlab),
    defaultModel:
      parsed.defaultModel === 'opus'
        ? 'opus'
        : parsed.defaultModel === 'haiku'
          ? 'haiku'
          : 'sonnet',
    reviewSkill: resolvedReviewSkill,
    reviewFollowupSkill: String(parsed.reviewFollowupSkill),
    language: parsed.language === 'fr' ? 'fr' : 'en',
    retentionDays: parseRetentionDays(parsed.retentionDays),
    agents: validateAgents(parsed.agents) ? parsed.agents : undefined,
    followupAgents: validateAgents(parsed.followupAgents) ? parsed.followupAgents : undefined,
    routingPolicy: parseRoutingPolicy(parsed.routingPolicy),
  };

  if (reviewFocus !== undefined) {
    config.reviewFocus = reviewFocus;
  }

  const externalLink = parseExternalLink(parsed.externalLink);
  if (externalLink !== undefined) {
    config.externalLink = externalLink;
  }

  const qualityThreshold = parseQualityThreshold(parsed.qualityThreshold);
  if (qualityThreshold !== undefined) {
    config.qualityThreshold = qualityThreshold;
  }

  const maxConcurrentReviews = parseMaxConcurrentReviews(parsed.maxConcurrentReviews);
  if (maxConcurrentReviews !== undefined) {
    config.maxConcurrentReviews = maxConcurrentReviews;
  }

  const maxDiffLines = parseMaxDiffLines(parsed.maxDiffLines);
  if (maxDiffLines !== undefined) {
    config.maxDiffLines = maxDiffLines;
  }

  return config;
}

/**
 * Get agents from project config or undefined for defaults
 */
export function getProjectAgents(localPath: string): AgentDefinition[] | undefined {
  try {
    const config = loadProjectConfig(localPath);
    return config?.agents;
  } catch {
    return undefined;
  }
}

/**
 * Resolve agents for a project: explicit agents array first, then focus-derived defaults.
 * Returns undefined when no explicit array and no focus are configured, leaving the caller
 * free to fall back to the legacy DEFAULT_AGENTS.
 */
export function getProjectAgentsOrFocusDefaults(localPath: string): AgentDefinition[] | undefined {
  try {
    const config = loadProjectConfig(localPath);
    if (!config) {
      return undefined;
    }
    if (config.agents !== undefined) {
      return config.agents;
    }
    if (config.reviewFocus !== undefined) {
      return defaultAgentsForFocus(config.reviewFocus);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get language from project config, defaulting to 'en'
 */
export function getProjectLanguage(localPath: string): Language {
  try {
    const config = loadProjectConfig(localPath);
    return config?.language ?? 'en';
  } catch {
    return 'en';
  }
}

/**
 * Get followup agents from project config or undefined for defaults
 */
export function getProjectRetentionDays(localPath: string): number {
  try {
    const config = loadProjectConfig(localPath);
    return config?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

export function getFollowupAgents(localPath: string): AgentDefinition[] | undefined {
  try {
    const config = loadProjectConfig(localPath);
    return config?.followupAgents;
  } catch {
    return undefined;
  }
}
