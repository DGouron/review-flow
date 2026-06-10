import {
  sessionCompletionSchema,
  type SessionCompletion,
} from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const sessionCompletionGuard = createGuard<SessionCompletion>(
  sessionCompletionSchema,
  'sessionCompletion',
);

export function parseSessionCompletion(data: unknown): SessionCompletion {
  return sessionCompletionGuard.parse(data);
}
