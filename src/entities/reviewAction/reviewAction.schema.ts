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

export const threadReplyActionSchema = z.object({
  type: z.literal('THREAD_REPLY'),
  threadId: z.string(),
  message: z.string(),
})

export const addLabelActionSchema = z.object({
  type: z.literal('ADD_LABEL'),
  label: z.string(),
})

export const fetchThreadsActionSchema = z.object({
  type: z.literal('FETCH_THREADS'),
})

export const reviewActionSchema = z.discriminatedUnion('type', [
  threadResolveActionSchema,
  postCommentActionSchema,
  threadReplyActionSchema,
  addLabelActionSchema,
  fetchThreadsActionSchema,
])
