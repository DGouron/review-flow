import {
  emberMemorySchema,
  emberRecurringInsightSchema,
} from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const emberMemoryGuard = createGuard(emberMemorySchema, 'emberMemory');

export const emberRecurringInsightGuard = createGuard(
  emberRecurringInsightSchema,
  'emberRecurringInsight',
);
