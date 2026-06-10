import { z } from 'zod';

import {
  promptKindSchema,
  promptOptionSchema,
} from '@/modules/setup-wizard/entities/promptOption/promptOption.schema.js';
import { stepIdSchema } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import { stepOutcomeStatusSchema } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

export const stepStartedEventSchema = z.object({
  step: stepIdSchema,
  status: z.literal('in_progress'),
  message: z.string(),
});

export const stepCompletedEventSchema = z.object({
  step: stepIdSchema,
  status: stepOutcomeStatusSchema,
  message: z.string().nullable().optional(),
  remediation: z.string().nullable().optional(),
});

export const awaitingInputEventSchema = z.object({
  step: stepIdSchema,
  status: z.literal('awaiting_input'),
  prompt: z.string(),
  kind: promptKindSchema,
  options: z.array(promptOptionSchema),
  defaultValue: z.string().nullable(),
});

export const instructionsBannerEventSchema = z.object({
  step: z.literal('instructions'),
  status: z.literal('info'),
  lines: z.array(z.string()),
});

export const warningBannerEventSchema = z.object({
  step: z.literal('warning'),
  status: z.literal('warning'),
  message: z.string(),
});

export const resumeBannerEventSchema = z.object({
  step: z.literal('resume'),
  status: z.literal('resumed'),
  resumeAt: stepIdSchema,
  position: z.number(),
  total: z.number(),
});

export const doneBannerEventSchema = z.object({
  step: z.literal('done'),
  status: z.literal('completed'),
  summary: z.record(z.string(), z.unknown()),
});

export const wizardStreamEventSchema = z.union([
  stepStartedEventSchema,
  awaitingInputEventSchema,
  instructionsBannerEventSchema,
  warningBannerEventSchema,
  resumeBannerEventSchema,
  doneBannerEventSchema,
  stepCompletedEventSchema,
]);

export type StepStartedEvent = z.infer<typeof stepStartedEventSchema>;
export type StepCompletedEvent = z.infer<typeof stepCompletedEventSchema>;
export type AwaitingInputEvent = z.infer<typeof awaitingInputEventSchema>;
export type InstructionsBannerEvent = z.infer<typeof instructionsBannerEventSchema>;
export type WarningBannerEvent = z.infer<typeof warningBannerEventSchema>;
export type ResumeBannerEvent = z.infer<typeof resumeBannerEventSchema>;
export type DoneBannerEvent = z.infer<typeof doneBannerEventSchema>;
export type WizardStreamEvent = z.infer<typeof wizardStreamEventSchema>;
