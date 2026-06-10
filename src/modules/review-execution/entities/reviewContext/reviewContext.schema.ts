import { z } from 'zod';

import { reviewActionSchema } from '@/modules/review-execution/entities/reviewAction/reviewAction.schema.js';

import { reviewContextResultSchema } from './reviewContextResult.schema.js';

export const reviewContextThreadSchema = z.object({
  id: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  status: z.enum(['open', 'resolved']),
  body: z.string(),
});

export const reviewContextAgentSchema = z.object({
  name: z.string(),
  displayName: z.string(),
});

export const reviewContextProgressSchema = z.object({
  phase: z.enum([
    'pending',
    'initializing',
    'agents-running',
    'synthesizing',
    'publishing',
    'completed',
  ]),
  currentStep: z.string().nullable(),
  stepsCompleted: z.array(z.string()).optional(),
  agents: z.array(reviewContextAgentSchema).optional(),
  updatedAt: z.string().optional(),
});

export const diffMetadataSchema = z.object({
  baseSha: z.string(),
  headSha: z.string(),
  startSha: z.string(),
});

export const agentInstructionsSchema = z.object({
  contextFilePath: z.string(),
  critical: z.array(z.string()),
  actionSchema: z.record(z.string(), z.record(z.string(), z.string())),
});

export const reviewContextSchema = z.object({
  version: z.string(),
  mergeRequestId: z.string(),
  platform: z.enum(['github', 'gitlab']),
  projectPath: z.string(),
  mergeRequestNumber: z.number(),
  createdAt: z.string(),
  threads: z.array(reviewContextThreadSchema),
  actions: z.array(reviewActionSchema),
  progress: reviewContextProgressSchema,
  result: reviewContextResultSchema.optional(),
  agentInstructions: agentInstructionsSchema.optional(),
  diffMetadata: diffMetadataSchema.optional(),
});

export const createReviewContextInputSchema = z.object({
  localPath: z.string(),
  mergeRequestId: z.string(),
  platform: z.enum(['github', 'gitlab']),
  projectPath: z.string(),
  mergeRequestNumber: z.number(),
  threads: z.array(reviewContextThreadSchema).optional(),
});
