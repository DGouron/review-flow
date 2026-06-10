import { z } from 'zod';

import { presetSchema } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export const agentPresetSchema = z.object({
  preset: presetSchema,
  agents: z.array(z.string()),
});

export type AgentPreset = z.infer<typeof agentPresetSchema>;
