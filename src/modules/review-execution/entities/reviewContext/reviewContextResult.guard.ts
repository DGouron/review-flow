import { createGuard } from '@/shared/foundation/guard.base.js';

import {
  reviewContextResultSchema,
  type ReviewContextResult,
} from './reviewContextResult.schema.js';

export const reviewContextResultGuard = createGuard(
  reviewContextResultSchema,
  'reviewContextResult',
);

export function parseReviewContextResult(data: unknown): ReviewContextResult {
  return reviewContextResultGuard.parse(data);
}

export function safeParseReviewContextResult(data: unknown) {
  return reviewContextResultGuard.safeParse(data);
}

export function isValidReviewContextResult(data: unknown): data is ReviewContextResult {
  return reviewContextResultGuard.safeParse(data).success;
}
