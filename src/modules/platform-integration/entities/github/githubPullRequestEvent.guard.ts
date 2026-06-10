import { z } from 'zod';

import { createGuard } from '@/shared/foundation/guard.base.js';

const gitHubPullRequestEventSchema = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().optional(),
    state: z.enum(['open', 'closed']),
    draft: z.boolean(),
    html_url: z.string(),
    user: z.object({ login: z.string() }).optional(),
    head: z.object({
      ref: z.string(),
      repo: z
        .object({
          full_name: z.string(),
          clone_url: z.string(),
        })
        .optional(),
    }),
    base: z.object({
      ref: z.string(),
      repo: z
        .object({
          full_name: z.string(),
        })
        .optional(),
    }),
    requested_reviewers: z.array(z.object({ login: z.string() })),
    assignees: z.array(z.object({ login: z.string() })).optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
    changed_files: z.number().optional(),
  }),
  repository: z.object({
    full_name: z.string(),
    html_url: z.string(),
    clone_url: z.string(),
  }),
  sender: z.object({ login: z.string() }),
  requested_reviewer: z.object({ login: z.string() }).optional(),
  label: z.object({ name: z.string() }).optional(),
});

export const gitHubPullRequestEventGuard = createGuard(
  gitHubPullRequestEventSchema,
  'gitHubPullRequestEvent',
);

export type GitHubPullRequestEvent = z.infer<typeof gitHubPullRequestEventSchema>;
