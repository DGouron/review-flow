import { z } from 'zod';

import { createGuard } from '@/shared/foundation/guard.base.js';

const gitHubPullRequestReviewEventSchema = z.object({
  action: z.string(),
  review: z.object({
    id: z.number(),
    state: z.string(),
    user: z.object({ login: z.string() }),
  }),
  pull_request: z.object({
    number: z.number(),
    state: z.enum(['open', 'closed']).optional(),
    html_url: z.string().optional(),
  }),
  repository: z.object({
    full_name: z.string(),
    html_url: z.string().optional(),
    clone_url: z.string(),
  }),
  sender: z.object({ login: z.string() }),
});

export const gitHubPullRequestReviewEventGuard = createGuard(
  gitHubPullRequestReviewEventSchema,
  'gitHubPullRequestReviewEvent',
);

export type GitHubPullRequestReviewEvent = z.infer<typeof gitHubPullRequestReviewEventSchema>;
