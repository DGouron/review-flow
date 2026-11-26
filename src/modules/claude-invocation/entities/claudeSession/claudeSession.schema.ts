import { z } from 'zod';

export const sessionIdSchema = z
  .string()
  .min(1, 'session id must not be empty')
  .brand<'SessionId'>();

export type SessionId = z.infer<typeof sessionIdSchema>;

export function parseSessionId(value: string): SessionId {
  return sessionIdSchema.parse(value);
}

export const claudeSessionStatusSchema = z.enum([
  'dispatched',
  'completed',
  'failed',
  'timed-out',
  'cleaned',
]);

export const claudeSessionJobTypeSchema = z.enum([
  'review',
  'followup',
  'ember-chat',
  'insights',
  'review-brief',
]);

export const claudeSessionSchema = z.object({
  sessionId: sessionIdSchema,
  jobId: z.string().min(1),
  jobType: claudeSessionJobTypeSchema,
  localPath: z.string().min(1),
  mergeRequestId: z.string().min(1),
  dispatchedAt: z.date(),
  status: claudeSessionStatusSchema,
  failureReason: z.string().nullable(),
});

export type ClaudeSession = z.infer<typeof claudeSessionSchema>;
export type ClaudeSessionStatus = z.infer<typeof claudeSessionStatusSchema>;
export type ClaudeSessionJobType = z.infer<typeof claudeSessionJobTypeSchema>;
