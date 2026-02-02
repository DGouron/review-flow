import { z } from 'zod'
import { reviewContextActionSchema, reviewContextResultSchema } from './reviewContextAction.schema.js'

export const reviewContextThreadSchema = z.object({
  id: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  status: z.enum(['open', 'resolved']),
  body: z.string(),
})

export const reviewContextProgressSchema = z.object({
  phase: z.enum(['pending', 'initializing', 'agents-running', 'synthesizing', 'publishing', 'completed']),
  currentStep: z.string().nullable(),
  stepsCompleted: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
})

export const reviewContextSchema = z.object({
  version: z.string(),
  mergeRequestId: z.string(),
  platform: z.enum(['github', 'gitlab']),
  projectPath: z.string(),
  mergeRequestNumber: z.number(),
  createdAt: z.string(),
  threads: z.array(reviewContextThreadSchema),
  actions: z.array(reviewContextActionSchema),
  progress: reviewContextProgressSchema,
  result: reviewContextResultSchema.optional(),
})

export const createReviewContextInputSchema = z.object({
  localPath: z.string(),
  mergeRequestId: z.string(),
  platform: z.enum(['github', 'gitlab']),
  projectPath: z.string(),
  mergeRequestNumber: z.number(),
  threads: z.array(reviewContextThreadSchema).optional(),
})
