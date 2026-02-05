import { reviewActionSchema } from './reviewAction.schema.js'
import type { ReviewAction } from './reviewAction.js'

export function parseReviewAction(data: unknown): ReviewAction {
  return reviewActionSchema.parse(data)
}

export function isValidReviewAction(data: unknown): data is ReviewAction {
  return reviewActionSchema.safeParse(data).success
}

export function safeParseReviewAction(data: unknown) {
  return reviewActionSchema.safeParse(data)
}

export function parseReviewActionCollection(data: unknown): ReviewAction[] {
  return reviewActionSchema.array().parse(data)
}
