import { z } from 'zod';

import { createGuard } from '@/shared/foundation/guard.base.js';

const gitHubIssueCommentEventSchema = z.object({
  action: z.literal('created'),
  issue: z.object({
    number: z.number(),
    pull_request: z.object({ url: z.string() }),
  }),
  comment: z.object({
    body: z.string(),
    user: z.object({ login: z.string() }),
  }),
  repository: z.object({
    full_name: z.string(),
    html_url: z.string(),
    clone_url: z.string(),
  }),
  sender: z.object({ login: z.string() }),
});

export const gitHubIssueCommentEventGuard = createGuard(
  gitHubIssueCommentEventSchema,
  'gitHubIssueCommentEvent',
);

export type GitHubIssueCommentEvent = z.infer<typeof gitHubIssueCommentEventSchema>;
