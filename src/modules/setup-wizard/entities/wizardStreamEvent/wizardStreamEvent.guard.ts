import { wizardStreamEventSchema } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const wizardStreamEventGuard = createGuard(wizardStreamEventSchema, 'wizardStreamEvent');
