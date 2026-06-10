import { createGuard } from '@/shared/foundation/guard.base.js';

import type { ReviewAction } from './reviewAction.js';
import { reviewActionSchema } from './reviewAction.schema.js';

const reviewActionGuard = createGuard(reviewActionSchema, 'reviewAction');

export const parseReviewAction: (data: unknown) => ReviewAction = reviewActionGuard.parse;
export const safeParseReviewAction = reviewActionGuard.safeParse;
export const isValidReviewAction: (data: unknown) => data is ReviewAction =
  reviewActionGuard.isValid;
export const parseReviewActionCollection: (data: unknown) => ReviewAction[] =
  reviewActionGuard.parseCollection;
