import { z } from 'zod';

import { recordedReviewRoleSchema } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';

export const tokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  costUsd: z.number(),
});

export const tokenUsageRecordSchema = z.object({
  jobId: z.string(),
  mrNumber: z.number(),
  platform: z.enum(['gitlab', 'github']),
  projectPath: z.string(),
  model: z.string(),
  recordedAt: z.string(),
  localPath: z.string(),
  usage: tokenUsageSchema,
  sessionId: z.string().optional(),
  jobType: z.enum(['review', 'followup']).optional(),
  durationMs: z.number().optional(),
  turns: z.number().optional(),
  role: recordedReviewRoleSchema.optional(),
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type TokenUsageRecord = z.infer<typeof tokenUsageRecordSchema>;
