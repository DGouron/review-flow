import type { z } from 'zod'
import type {
  reviewActionSchema,
  threadResolveActionSchema,
  postCommentActionSchema,
  threadReplyActionSchema,
  addLabelActionSchema,
  fetchThreadsActionSchema,
} from './reviewAction.schema.js'

// Individual action types
export type ThreadResolveAction = z.infer<typeof threadResolveActionSchema>
export type PostCommentAction = z.infer<typeof postCommentActionSchema>
export type ThreadReplyAction = z.infer<typeof threadReplyActionSchema>
export type AddLabelAction = z.infer<typeof addLabelActionSchema>
export type FetchThreadsAction = z.infer<typeof fetchThreadsActionSchema>

// Unified ReviewAction type
export type ReviewAction = z.infer<typeof reviewActionSchema>

// Backward compatibility aliases
export type ThreadAction = ReviewAction
export type ReviewContextAction = ReviewAction
