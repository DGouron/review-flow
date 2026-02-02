import { z } from 'zod'
import { createGuard } from '../../shared/foundation/guard.base.js'
import {
  reviewContextActionSchema,
  reviewContextResultSchema,
  type ReviewContextAction,
  type ReviewContextResult,
} from './reviewContextAction.schema.js'

export const reviewContextActionGuard = createGuard(reviewContextActionSchema)
export const reviewContextActionsGuard = createGuard(z.array(reviewContextActionSchema))
export const reviewContextResultGuard = createGuard(reviewContextResultSchema)

export function parseReviewContextAction(data: unknown): ReviewContextAction {
  return reviewContextActionGuard.parse(data)
}

export function safeParseReviewContextAction(data: unknown) {
  return reviewContextActionGuard.safeParse(data)
}

export function isValidReviewContextAction(data: unknown): data is ReviewContextAction {
  return reviewContextActionGuard.safeParse(data).success
}

export function parseReviewContextActions(data: unknown): ReviewContextAction[] {
  return reviewContextActionsGuard.parse(data)
}

export function parseReviewContextResult(data: unknown): ReviewContextResult {
  return reviewContextResultGuard.parse(data)
}

export function safeParseReviewContextResult(data: unknown) {
  return reviewContextResultGuard.safeParse(data)
}

export function isValidReviewContextResult(data: unknown): data is ReviewContextResult {
  return reviewContextResultGuard.safeParse(data).success
}
