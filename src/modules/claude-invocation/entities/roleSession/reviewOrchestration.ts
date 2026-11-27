import { z } from 'zod';

import {
  RETIRED_ROLE_SUCCESSORS,
  reviewRoleSchema,
  type ReviewRole,
} from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';

const reviewModeSchema = z.enum(['single', 'orchestrated']);
const roleModelSchema = z.enum(['haiku', 'sonnet', 'opus']);

/** A config may still name a retired role: its model is ignored, the successor keeps its own. */
function withoutRetiredRoles(roles: unknown): unknown {
  if (typeof roles !== 'object' || roles === null) return roles;
  return Object.fromEntries(
    Object.entries(roles).filter(([role]) => !(role in RETIRED_ROLE_SUCCESSORS)),
  );
}

const MINUTE_MS = 60_000;
const DEFAULT_ORCHESTRATED_TIMEOUT_MINUTES = 45;
const DEFAULT_ROLE_TIMEOUT_MINUTES = 15;

const reviewOrchestrationSettingsSchema = z.object({
  mode: reviewModeSchema.nullable().default(null),
  orchestratedTimeoutMinutes: z.number().int().min(5).max(480).nullable().default(null),
  roleTimeoutMinutes: z.number().int().min(1).max(480).nullable().default(null),
  roles: z
    .preprocess(
      withoutRetiredRoles,
      z.partialRecord(reviewRoleSchema, z.object({ model: roleModelSchema })),
    )
    .default({}),
});

export type ReviewMode = z.infer<typeof reviewModeSchema>;
export type RoleModel = z.infer<typeof roleModelSchema>;
export type ReviewOrchestrationSettings = z.infer<typeof reviewOrchestrationSettingsSchema>;

/** Two reviews run at once, so at most ten role sessions live on the machine. */
export const MAX_LIVE_ROLE_SESSIONS_PER_JOB = 5;

const FINISHED_SESSION_STATES: ReadonlySet<string> = new Set(['done', 'stopped', 'failed']);

/** A session counts against the cap until it is finished; an unknown state still counts. */
export function occupiesRoleSessionSlot(state: string | null): boolean {
  return state === null || !FINISHED_SESSION_STATES.has(state);
}

const DEFAULT_ROLE_MODELS: Record<ReviewRole, RoleModel> = {
  greffe: 'sonnet',
  'lot:bugs': 'opus',
  'lot:architecture': 'opus',
  'lot:lisibilite': 'sonnet',
  'lot:tests': 'sonnet',
  contradiction: 'opus',
  arbitre: 'opus',
};

/**
 * Validates the `review` object of a project config.
 * @throws Error naming the faulty `review.*` key
 */
export function parseReviewOrchestrationSettings(value: unknown): ReviewOrchestrationSettings {
  const result = reviewOrchestrationSettingsSchema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = ['review', ...(issue?.path ?? []).map(String)].join('.');
  throw new Error(`Invalid ${path}: ${issue?.message ?? 'invalid value'}`);
}

export function reviewModeOf(settings: ReviewOrchestrationSettings | null): ReviewMode {
  return settings?.mode ?? 'single';
}

/** Only a review is orchestrated: a follow-up stays a single session. */
export function isOrchestratedReview(
  settings: ReviewOrchestrationSettings | null,
  jobType: 'review' | 'followup',
): boolean {
  return jobType === 'review' && reviewModeOf(settings) === 'orchestrated';
}

export function orchestratedReviewTimeoutMs(settings: ReviewOrchestrationSettings | null): number {
  return (settings?.orchestratedTimeoutMinutes ?? DEFAULT_ORCHESTRATED_TIMEOUT_MINUTES) * MINUTE_MS;
}

/** How long a role session may run, from its launch, before it counts as silent. */
export function roleSessionTimeoutMs(settings: ReviewOrchestrationSettings | null): number {
  return (settings?.roleTimeoutMinutes ?? DEFAULT_ROLE_TIMEOUT_MINUTES) * MINUTE_MS;
}

export function modelForRole(
  settings: ReviewOrchestrationSettings | null,
  role: ReviewRole,
): RoleModel {
  return settings?.roles[role]?.model ?? DEFAULT_ROLE_MODELS[role];
}
