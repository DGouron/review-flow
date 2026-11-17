import type { HookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.schema.js';

export const GITHUB_HOOK_RANGES_SAMPLE = [
  '192.30.252.0/22',
  '185.199.108.0/22',
  '140.82.112.0/20',
  '143.55.64.0/20',
  '9.234.106.48/28',
  '9.234.98.160/28',
  '9.234.98.176/28',
  '2a0a:a440::/29',
  '2606:50c0::/32',
];

export class HookRangesSnapshotFactory {
  static create(overrides: Partial<HookRangesSnapshot> = {}): HookRangesSnapshot {
    return {
      ranges: GITHUB_HOOK_RANGES_SAMPLE,
      fetchedAt: '2026-11-09T08:00:00.000Z',
      ...overrides,
    };
  }
}
