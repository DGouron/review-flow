import { stepOutcomeSchema } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const stepOutcomeGuard = createGuard(stepOutcomeSchema, 'stepOutcome');
