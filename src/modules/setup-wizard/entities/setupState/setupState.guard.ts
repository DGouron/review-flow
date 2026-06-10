import { setupStateSchema } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const setupStateGuard = createGuard(setupStateSchema, 'setupState');
