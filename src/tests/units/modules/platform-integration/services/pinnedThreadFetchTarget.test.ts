import { describe, it, expect } from 'vitest';

import { resolvePinnedThreadFetchTarget } from '@/modules/platform-integration/services/pinnedThreadFetchTarget.js';

class RecordingThreadFetch {
  public readonly calls: Array<{ projectPath: string; mrNumber: number }> = [];
  fetchThreads = (projectPath: string, mrNumber: number) => {
    this.calls.push({ projectPath, mrNumber });
    return [];
  };
}

describe('pinned thread-fetch target provenance (AC9)', () => {
  it('resolves the validated pair when project is configured and mrNumber matches the gated MR', () => {
    const target = resolvePinnedThreadFetchTarget({
      payloadProjectPath: 'group/proj',
      payloadMrNumber: 5,
      findRepository: () => ({ projectPath: 'group/proj', localPath: '/repo' }),
      gatedMrNumber: 5,
    });

    expect(target).toEqual({ projectPath: 'group/proj', mrNumber: 5 });
  });

  it('fails closed (null) when projectPath is not in the registry', () => {
    const target = resolvePinnedThreadFetchTarget({
      payloadProjectPath: 'attacker/unknown',
      payloadMrNumber: 5,
      findRepository: () => null,
      gatedMrNumber: 5,
    });

    expect(target).toBeNull();
  });

  it('fails closed (null) when payload mrNumber differs from the gated MR', () => {
    const target = resolvePinnedThreadFetchTarget({
      payloadProjectPath: 'group/proj',
      payloadMrNumber: 999,
      findRepository: () => ({ projectPath: 'group/proj', localPath: '/repo' }),
      gatedMrNumber: 5,
    });

    expect(target).toBeNull();
  });

  it('AC9(1): unrecognized project means fetchThreads is never called', () => {
    const fetch = new RecordingThreadFetch();
    const target = resolvePinnedThreadFetchTarget({
      payloadProjectPath: 'attacker/unknown',
      payloadMrNumber: 5,
      findRepository: () => null,
      gatedMrNumber: 5,
    });
    if (target) fetch.fetchThreads(target.projectPath, target.mrNumber);

    expect(fetch.calls).toHaveLength(0);
  });

  it('AC9(2): forged mrNumber never retargets fetchThreads at the foreign MR', () => {
    const fetch = new RecordingThreadFetch();
    const target = resolvePinnedThreadFetchTarget({
      payloadProjectPath: 'group/proj',
      payloadMrNumber: 999,
      findRepository: () => ({ projectPath: 'group/proj', localPath: '/repo' }),
      gatedMrNumber: 5,
    });
    if (target) fetch.fetchThreads(target.projectPath, target.mrNumber);

    expect(fetch.calls.find((c) => c.mrNumber === 999)).toBeUndefined();
    expect(fetch.calls).toHaveLength(0);
  });

  it('uses the configured projectPath, never the raw payload, to fetch', () => {
    const fetch = new RecordingThreadFetch();
    const target = resolvePinnedThreadFetchTarget({
      payloadProjectPath: 'group/proj',
      payloadMrNumber: 5,
      findRepository: () => ({ projectPath: 'group/proj-canonical', localPath: '/repo' }),
      gatedMrNumber: 5,
    });
    if (target) fetch.fetchThreads(target.projectPath, target.mrNumber);

    expect(fetch.calls).toEqual([{ projectPath: 'group/proj-canonical', mrNumber: 5 }]);
  });
});
