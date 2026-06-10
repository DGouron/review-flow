import { agentPresetSchema } from '@/modules/setup-wizard/entities/agentPreset/agentPreset.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const agentPresetGuard = createGuard(agentPresetSchema, 'agentPreset');
