import { projectContextSchema } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const projectContextGuard = createGuard(projectContextSchema, 'projectContext');
