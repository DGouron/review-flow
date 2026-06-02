import { z } from 'zod';

export const triggerModeSchema = z.enum(['full-auto', 'semi-auto']);

export type TriggerMode = z.infer<typeof triggerModeSchema>;
