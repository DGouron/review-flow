import { z } from 'zod';

import { createGuard } from '@/shared/foundation/guard.base.js';

export const recalculateBodySchema = z.object({
  path: z.string().optional(),
  backfill: z.boolean().optional(),
});

export type RecalculateBody = z.infer<typeof recalculateBodySchema>;

const recalculateBodyGuard = createGuard(recalculateBodySchema, 'recalculateBody');

export const safeParseRecalculateBody = recalculateBodyGuard.safeParse;
