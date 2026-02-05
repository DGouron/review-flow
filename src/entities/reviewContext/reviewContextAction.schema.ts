// Strangler Fig: Re-export from unified entity
// This file will be removed once all imports are updated
export {
  threadResolveActionSchema,
  postCommentActionSchema,
  addLabelActionSchema,
  reviewActionSchema as reviewContextActionSchema,
} from '../reviewAction/reviewAction.schema.js'

export type {
  ThreadResolveAction,
  PostCommentAction,
  AddLabelAction,
  ReviewContextAction,
} from '../reviewAction/reviewAction.js'

// Keep ReviewContextResult here as it's specific to this context
import { z } from 'zod'

export const reviewContextResultSchema = z.object({
  blocking: z.number(),
  warnings: z.number(),
  suggestions: z.number(),
  score: z.number(),
  verdict: z.enum(['ready_to_merge', 'needs_fixes', 'needs_discussion']),
})

export type ReviewContextResult = z.infer<typeof reviewContextResultSchema>
