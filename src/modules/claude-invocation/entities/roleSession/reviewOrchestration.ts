import { z } from 'zod';

import {
  reviewRoleSchema,
  type ReviewRole,
} from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';

const reviewModeSchema = z.enum(['single', 'orchestrated']);
const roleModelSchema = z.enum(['haiku', 'sonnet', 'opus']);

const reviewOrchestrationSettingsSchema = z.object({
  mode: reviewModeSchema.nullable().default(null),
  roles: z.partialRecord(reviewRoleSchema, z.object({ model: roleModelSchema })).default({}),
});

export type ReviewMode = z.infer<typeof reviewModeSchema>;
export type RoleModel = z.infer<typeof roleModelSchema>;
export type ReviewOrchestrationSettings = z.infer<typeof reviewOrchestrationSettingsSchema>;

/** Two reviews run at once, so at most ten role sessions live on the machine. */
export const MAX_LIVE_ROLE_SESSIONS_PER_JOB = 5;

const DEFAULT_ROLE_MODELS: Record<ReviewRole, RoleModel> = {
  greffe: 'sonnet',
  'lot:bugs': 'opus',
  'lot:securite': 'opus',
  'lot:architecture': 'sonnet',
  'lot:lisibilite': 'sonnet',
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

export function modelForRole(
  settings: ReviewOrchestrationSettings | null,
  role: ReviewRole,
): RoleModel {
  return settings?.roles[role]?.model ?? DEFAULT_ROLE_MODELS[role];
}
