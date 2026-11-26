import {
  reviewBriefModelOutputSchema,
  reviewBriefSchema,
} from '@/modules/review-brief/entities/reviewBrief/reviewBrief.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const reviewBriefModelOutputGuard = createGuard(
  reviewBriefModelOutputSchema,
  'reviewBriefModelOutput',
);

export const reviewBriefGuard = createGuard(reviewBriefSchema, 'reviewBrief');
