import { ReviewRequestSchema, type ReviewRequest } from './reviewRequest.entity.js';

export function parseReviewRequest(data: unknown): ReviewRequest {
  return ReviewRequestSchema.parse(data);
}

export function safeParseReviewRequest(data: unknown) {
  return ReviewRequestSchema.safeParse(data);
}

export function isValidReviewRequest(data: unknown): data is ReviewRequest {
  return ReviewRequestSchema.safeParse(data).success;
}
