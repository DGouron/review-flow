import { z } from 'zod';

import { claudeModelNameSchema } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';
import { languageSchema } from '@/modules/shared-kernel/entities/language/language.schema.js';

export const reviewJobSnapshotSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(['gitlab', 'github']),
  projectPath: z.string().min(1),
  localPath: z.string().min(1),
  mrNumber: z.number().int().positive(),
  skill: z.string().min(1),
  mrUrl: z.string().min(1),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  jobType: z.enum(['review', 'followup']).optional(),
  language: languageSchema.optional(),
  model: claudeModelNameSchema.optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  assignedBy: z
    .object({
      username: z.string(),
      displayName: z.string().optional(),
    })
    .optional(),
  sourceForkCloneUrl: z.string().optional(),
});

export const triggerSourceSchema = z.enum([
  'webhook-initial',
  'webhook-followup',
  'dashboard-manual',
]);

export const pendingReviewRequestSchema = z.object({
  pendingReviewRequestId: z.string().min(1),
  job: reviewJobSnapshotSchema,
  jobType: z.enum(['review', 'followup']),
  platform: z.enum(['gitlab', 'github']),
  triggerSource: triggerSourceSchema,
  createdAt: z.string().min(1),
});

export type TriggerSource = z.infer<typeof triggerSourceSchema>;
export type PendingReviewRequest = z.infer<typeof pendingReviewRequestSchema>;
