import {
  claudeSessionSchema,
  type ClaudeSession,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const claudeSessionGuard = createGuard<ClaudeSession>(claudeSessionSchema, 'claudeSession');
