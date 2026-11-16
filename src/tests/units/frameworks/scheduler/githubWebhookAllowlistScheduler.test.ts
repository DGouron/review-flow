import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startGitHubWebhookAllowlistScheduler } from '@/frameworks/scheduler/githubWebhookAllowlistScheduler.js';
import type { WebhookAllowlistResolution } from '@/modules/platform-integration/entities/transport/webhookAllowlist.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000;
const MANUAL_RANGES = ['10.0.0.0/8'];

function sequenceOf(results: Array<WebhookAllowlistResolution | Error>) {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    async execute(): Promise<WebhookAllowlistResolution> {
      const next = results[Math.min(callCount, results.length - 1)];
      callCount += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe('startGitHubWebhookAllowlistScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves the allowlist before returning', async () => {
    const refreshAllowlist = sequenceOf([
      { source: 'github-meta', allowedCidrRanges: ['192.30.252.0/22', '10.0.0.0/8'] },
    ]);

    const scheduler = await startGitHubWebhookAllowlistScheduler({
      refreshAllowlist,
      initialRanges: MANUAL_RANGES,
      intervalMs: INTERVAL_MS,
      logger: createCapturingLogger().logger,
    });

    expect(scheduler.currentRanges()).toEqual(['192.30.252.0/22', '10.0.0.0/8']);
    scheduler.stop();
  });

  it('refreshes the allowlist at every interval', async () => {
    const refreshAllowlist = sequenceOf([
      { source: 'github-meta', allowedCidrRanges: ['192.30.252.0/22'] },
      { source: 'github-meta', allowedCidrRanges: ['192.30.252.0/22', '9.234.106.48/28'] },
    ]);
    const scheduler = await startGitHubWebhookAllowlistScheduler({
      refreshAllowlist,
      initialRanges: MANUAL_RANGES,
      intervalMs: INTERVAL_MS,
      logger: createCapturingLogger().logger,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(refreshAllowlist.callCount).toBe(2);
    expect(scheduler.currentRanges()).toEqual(['192.30.252.0/22', '9.234.106.48/28']);
    scheduler.stop();
  });

  it('stops refreshing once stopped', async () => {
    const refreshAllowlist = sequenceOf([{ source: 'manual-only', allowedCidrRanges: [] }]);
    const scheduler = await startGitHubWebhookAllowlistScheduler({
      refreshAllowlist,
      initialRanges: MANUAL_RANGES,
      intervalMs: INTERVAL_MS,
      logger: createCapturingLogger().logger,
    });

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(refreshAllowlist.callCount).toBe(1);
  });

  it('keeps the previous allowlist and logs an error when a refresh throws', async () => {
    const capturing = createCapturingLogger();
    const refreshAllowlist = sequenceOf([new Error('cache unreadable')]);

    const scheduler = await startGitHubWebhookAllowlistScheduler({
      refreshAllowlist,
      initialRanges: MANUAL_RANGES,
      intervalMs: INTERVAL_MS,
      logger: capturing.logger,
    });

    expect(scheduler.currentRanges()).toEqual(MANUAL_RANGES);
    expect(capturing.errorMessages.join('\n')).toContain('cache unreadable');
    scheduler.stop();
  });
});
