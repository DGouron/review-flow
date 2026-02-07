import { z } from 'zod'
import { createGuard } from '../../shared/foundation/guard.base.js'

const gitLabMergeRequestEventSchema = z.object({
  object_kind: z.literal('merge_request'),
  event_type: z.string(),
  user: z.object({
    username: z.string(),
    name: z.string(),
  }),
  project: z.object({
    id: z.number(),
    name: z.string(),
    path_with_namespace: z.string(),
    web_url: z.string(),
    git_http_url: z.string(),
  }),
  object_attributes: z.object({
    iid: z.number(),
    title: z.string(),
    description: z.string().optional(),
    state: z.enum(['opened', 'closed', 'merged', 'locked']),
    action: z.string(),
    source_branch: z.string(),
    target_branch: z.string(),
    url: z.string(),
    draft: z.boolean().optional(),
  }),
  reviewers: z
    .array(
      z.object({
        username: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  assignees: z
    .array(
      z.object({
        username: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  changes: z
    .object({
      reviewers: z
        .object({
          previous: z.array(z.object({ username: z.string() })),
          current: z.array(z.object({ username: z.string() })),
        })
        .optional(),
    })
    .optional(),
})

export const gitLabMergeRequestEventGuard = createGuard(gitLabMergeRequestEventSchema)

export type GitLabMergeRequestEvent = z.infer<typeof gitLabMergeRequestEventSchema>
