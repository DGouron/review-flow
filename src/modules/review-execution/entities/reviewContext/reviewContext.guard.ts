import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { reviewContextSchema } from '@/modules/review-execution/entities/reviewContext/reviewContext.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const reviewContextGuard = createGuard<ReviewContext>(reviewContextSchema, 'reviewContext');
