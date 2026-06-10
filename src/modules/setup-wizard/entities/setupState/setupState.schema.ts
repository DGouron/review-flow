import { z } from 'zod';

import { projectContextSchema } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import { stepIdSchema } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import { stepOutcomeSchema } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

export const setupStateSchema = z.object({
  version: z.literal(1),
  startedAt: z.string(),
  updatedAt: z.string(),
  steps: z.partialRecord(stepIdSchema, stepOutcomeSchema),
  project: projectContextSchema.optional(),
});

export type SetupState = z.infer<typeof setupStateSchema>;
