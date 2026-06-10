import { z } from 'zod';

import { createGuard } from '@/shared/foundation/guard.base.js';

const gitLabNoteEventSchema = z.object({
  object_kind: z.literal('note'),
  event_type: z.string().optional(),
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
    id: z.number().optional(),
    note: z.string(),
    noteable_type: z.literal('MergeRequest'),
    noteable_id: z.number().optional(),
  }),
  merge_request: z.object({
    iid: z.number(),
    title: z.string().optional(),
    state: z.string().optional(),
    source_branch: z.string().optional(),
    target_branch: z.string().optional(),
    url: z.string().optional(),
  }),
});

export const gitLabNoteEventGuard = createGuard(gitLabNoteEventSchema, 'gitLabNoteEvent');

export type GitLabNoteEvent = z.infer<typeof gitLabNoteEventSchema>;
