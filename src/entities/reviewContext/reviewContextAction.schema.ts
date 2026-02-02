import { z } from 'zod'

export const threadResolveActionSchema = z.object({
  type: z.literal('THREAD_RESOLVE'),
  threadId: z.string(),
  message: z.string().optional(),
})

export const postCommentActionSchema = z.object({
  type: z.literal('POST_COMMENT'),
  body: z.string(),
})

export const addLabelActionSchema = z.object({
  type: z.literal('ADD_LABEL'),
  label: z.string(),
})

export const reviewContextActionSchema = z.discriminatedUnion('type', [
  threadResolveActionSchema,
  postCommentActionSchema,
  addLabelActionSchema,
])

export const reviewContextResultSchema = z.object({
  blocking: z.number(),
  warnings: z.number(),
  suggestions: z.number(),
  score: z.number(),
  verdict: z.enum(['ready_to_merge', 'needs_fixes', 'needs_discussion']),
})

export type ThreadResolveAction = z.infer<typeof threadResolveActionSchema>
export type PostCommentAction = z.infer<typeof postCommentActionSchema>
export type AddLabelAction = z.infer<typeof addLabelActionSchema>
export type ReviewContextAction = z.infer<typeof reviewContextActionSchema>
export type ReviewContextResult = z.infer<typeof reviewContextResultSchema>
