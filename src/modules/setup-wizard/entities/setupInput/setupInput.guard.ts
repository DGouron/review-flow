import { setupInputSchema } from '@/modules/setup-wizard/entities/setupInput/setupInput.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const setupInputGuard = createGuard(setupInputSchema, 'setupInput');
