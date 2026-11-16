import { z } from 'zod';

const cidrRangesSchema = z.array(z.string().min(1)).min(1);

export const gitHubMetaResponseSchema = z.object({
  hooks: cidrRangesSchema,
});

export type GitHubMetaResponse = z.infer<typeof gitHubMetaResponseSchema>;

export const hookRangesSnapshotSchema = z.object({
  ranges: cidrRangesSchema,
  fetchedAt: z.string().min(1),
});

export type HookRangesSnapshot = z.infer<typeof hookRangesSnapshotSchema>;
