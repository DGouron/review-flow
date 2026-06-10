import {
  pendingReviewRequestSchema,
  type PendingReviewRequest,
} from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const pendingReviewRequestGuard = createGuard<PendingReviewRequest>(
  pendingReviewRequestSchema,
  'pendingReviewRequest',
);
