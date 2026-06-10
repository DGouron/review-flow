import { emberMemorySchema } from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const emberMemoryGuard = createGuard(emberMemorySchema, 'emberMemory');
