import { describe, expect, it } from 'vitest';

import {
  safeParseGitHubMetaResponse,
  safeParseHookRangesSnapshot,
} from '@/modules/platform-integration/entities/transport/githubHookRanges.guard.js';
import {
  GITHUB_HOOK_RANGES_SAMPLE,
  HookRangesSnapshotFactory,
} from '@/tests/factories/hookRangesSnapshot.factory.js';

function issueMessages(result: ReturnType<typeof safeParseGitHubMetaResponse>): string {
  return result.success ? '' : result.error.issues.map((issue) => issue.message).join('\n');
}

describe('GitHub hook ranges guard', () => {
  it('accepts the ranges GitHub publishes today', () => {
    expect(safeParseGitHubMetaResponse({ hooks: GITHUB_HOOK_RANGES_SAMPLE }).success).toBe(true);
  });

  it.each(['oops', '10.0.0.0', '10.0.0.0/ ', '10.0.0.0/8/32', '2001:db8::1::/64'])(
    'rejects the whole answer when one range "%s" is not a CIDR range',
    (invalidRange) => {
      const result = safeParseGitHubMetaResponse({
        hooks: [...GITHUB_HOOK_RANGES_SAMPLE, invalidRange],
      });

      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain('not a CIDR range');
    },
  );

  it.each(['0.0.0.0/0', '10.0.0.0/8', '172.16.0.0/15', '::/0', '2001::/16', '2001:db8::/23'])(
    'rejects the whole answer when one range "%s" is broader than allowed',
    (broadRange) => {
      const result = safeParseGitHubMetaResponse({ hooks: ['192.30.252.0/22', broadRange] });

      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(`too broad: "${broadRange}"`);
    },
  );

  it('accepts the narrowest ranges at the allowed limit', () => {
    expect(safeParseGitHubMetaResponse({ hooks: ['172.16.0.0/16', '2001:db8::/24'] }).success).toBe(
      true,
    );
  });

  it('truncates a very long invalid range in the issue message', () => {
    const result = safeParseGitHubMetaResponse({ hooks: ['x'.repeat(5_000)] });

    expect(result.success).toBe(false);
    expect(issueMessages(result).length).toBeLessThan(200);
  });

  it('applies the same rules to the cached snapshot', () => {
    expect(safeParseHookRangesSnapshot(HookRangesSnapshotFactory.create()).success).toBe(true);
    expect(
      safeParseHookRangesSnapshot(HookRangesSnapshotFactory.create({ ranges: ['0.0.0.0/0'] }))
        .success,
    ).toBe(false);
    expect(
      safeParseHookRangesSnapshot(HookRangesSnapshotFactory.create({ ranges: ['oops'] })).success,
    ).toBe(false);
  });
});
