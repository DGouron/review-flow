import { z } from 'zod';

export const sessionUsageSnapshotSchema = z.object({
  sessionId: z.string(),
  model: z.string(),
  turns: z.number(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    costUsd: z.number(),
  }),
});

export type SessionUsageSnapshot = z.infer<typeof sessionUsageSnapshotSchema>;
