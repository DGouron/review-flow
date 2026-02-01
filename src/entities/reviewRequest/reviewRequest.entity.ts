import { z } from 'zod';

export const PlatformSchema = z.enum(['gitlab', 'github']);
export type Platform = z.infer<typeof PlatformSchema>;

export const ReviewRequestStateSchema = z.enum([
  'open',
  'closed',
  'merged',
]);
export type ReviewRequestState = z.infer<typeof ReviewRequestStateSchema>;

export const ReviewRequestSchema = z.object({
  platform: PlatformSchema,
  projectPath: z.string().min(1),
  reviewRequestNumber: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  state: ReviewRequestStateSchema,
  isDraft: z.boolean(),
  author: z.string(),
  assignedReviewer: z.string().optional(),
  webUrl: z.string().url(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
