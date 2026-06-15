import { describe, it, expect } from 'vitest';

import {
  resolvePinnedThreadFetchTarget,
  resolvePinnedThreads,
} from '@/modules/platform-integration/services/pinnedThreadFetchTarget.js';
import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

class RecordingThreadFetch {
  public readonly calls: Array<{ projectPath: string; mrNumber: number }> = [];
  private result: ReviewContextThread[] = [];
  setResult(threads: ReviewContextThread[]): void {
    this.result = threads;
  }
  fetchThreads = (projectPath: string, mrNumber: number) => {
    this.calls.push({ projectPath, mrNumber });
    return this.result;
  };
}

class RecordingLogger {
  public readonly warnings: string[] = [];
  warn = (_obj: object, message: string): void => {
    this.warnings.push(message);
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

describe('pinned thread resolution at a call site (AC9 — used by review + followup processors)', () => {
  it('fetches threads through the pinned target when the project is configured', () => {
    const fetch = new RecordingThreadFetch();
    fetch.setResult([{ id: '1', file: null, line: null, status: 'open', body: 'thread' }]);
    const logger = new RecordingLogger();

    const threads = resolvePinnedThreads({
      payloadProjectPath: 'group/proj',
      payloadMrNumber: 5,
      findRepository: () => ({ projectPath: 'group/proj' }),
      gatedMrNumber: 5,
      fetchThreads: fetch.fetchThreads,
      logger,
    });

    expect(threads).toHaveLength(1);
    expect(fetch.calls).toEqual([{ projectPath: 'group/proj', mrNumber: 5 }]);
    expect(logger.warnings).toHaveLength(0);
  });

  it('fails closed to an empty surface and never calls fetchThreads for an unrecognized project', () => {
    const fetch = new RecordingThreadFetch();
    const logger = new RecordingLogger();

    const threads = resolvePinnedThreads({
      payloadProjectPath: 'attacker/unknown',
      payloadMrNumber: 5,
      findRepository: () => null,
      gatedMrNumber: 5,
      fetchThreads: fetch.fetchThreads,
      logger,
    });

    expect(threads).toEqual([]);
    expect(fetch.calls).toHaveLength(0);
    expect(logger.warnings).toHaveLength(1);
  });
});
