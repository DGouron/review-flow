import { z } from 'zod';

import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export const degradedReasonSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stale'),
    ageMs: z.number().int().nonnegative(),
    thresholdMs: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('orphan-git-lock'),
    lockPath: z.string().min(1),
    lockAgeMs: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('unresolved-conflict'),
  }),
]);

export type DegradedReason = z.infer<typeof degradedReasonSchema>;
export type DegradedReasonKind = DegradedReason['kind'];

export const worktreeHealthSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('healthy'),
  }),
  z.object({
    status: z.literal('degraded'),
    reason: degradedReasonSchema,
    detectedAt: z.date(),
  }),
]);

export type WorktreeHealth = z.infer<typeof worktreeHealthSchema>;

export interface WorktreeHealthReport {
  entry: WorktreeEntry;
  health: WorktreeHealth;
}
