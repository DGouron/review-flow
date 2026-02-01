import { z } from 'zod'
import { createGuard } from '../../shared/foundation/guard.base.js'

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
    head: z.object({ ref: z.string() }),
    base: z.object({ ref: z.string() }),
    requested_reviewers: z.array(z.object({ login: z.string() })),
  }),
  repository: z.object({
    full_name: z.string(),
    html_url: z.string(),
    clone_url: z.string(),
  }),
  sender: z.object({ login: z.string() }),
  requested_reviewer: z.object({ login: z.string() }).optional(),
  label: z.object({ name: z.string() }).optional(),
})

export const gitHubPullRequestEventGuard = createGuard(gitHubPullRequestEventSchema)

export type GitHubPullRequestEvent = z.infer<typeof gitHubPullRequestEventSchema>
