import { z } from 'zod';

import { CidrRange } from '@/modules/platform-integration/entities/transport/cidrRange.valueObject.js';

/**
 * GitHub publishes /20 to /22 in IPv4 and /29 to /32 in IPv6. A hook range
 * broader than these floors is treated as a poisoned answer, never as an
 * allowlist entry.
 */
const MINIMUM_HOOK_PREFIX_LENGTH = { 32: 16, 128: 24 } as const;
const MAXIMUM_QUOTED_RANGE_LENGTH = 64;

function quote(text: string): string {
  return JSON.stringify(text.slice(0, MAXIMUM_QUOTED_RANGE_LENGTH));
}

const hookRangeSchema = z.string().superRefine((text, context) => {
  const range = CidrRange.parse(text);
  if (range === null) {
    context.addIssue({ code: 'custom', message: `not a CIDR range: ${quote(text)}` });
    return;
  }
  const minimumPrefixLength = MINIMUM_HOOK_PREFIX_LENGTH[range.bitWidth];
  if (range.prefixLength < minimumPrefixLength) {
    context.addIssue({
      code: 'custom',
      message: `hook range too broad: ${quote(text)} (minimum /${minimumPrefixLength})`,
    });
  }
});

const hookRangesSchema = z.array(hookRangeSchema).min(1);

export const gitHubMetaResponseSchema = z.object({
  hooks: hookRangesSchema,
});

export type GitHubMetaResponse = z.infer<typeof gitHubMetaResponseSchema>;

export const hookRangesSnapshotSchema = z.object({
  ranges: hookRangesSchema,
  fetchedAt: z.string().min(1),
});

export type HookRangesSnapshot = z.infer<typeof hookRangesSnapshotSchema>;
