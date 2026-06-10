import { emberMessageSchema } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const emberMessageGuard = createGuard(emberMessageSchema, 'emberMessage');
