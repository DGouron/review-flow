import { describe, expect, it, vi } from 'vitest';

import { runReviewRecovery } from '@/modules/review-execution/services/reviewRecovery.service.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';

const NOW = new Date('2026-05-25T21:00:00Z').getTime();
const ONE_HOUR_AGO = new Date('2026-05-25T20:00:00Z').toISOString();
const ONE_MINUTE_AGO = new Date('2026-05-25T20:59:00Z').toISOString();
const ONE_HOUR_AGO_TWO_MIN_HEARTBEAT = '2026-05-25T20:58:00Z';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const EMPTY_SUMMARY = {
  scanned: 0,
  recovered: 0,
  partial: 0,
  backfilled: 0,
  skipped: 0,
  failed: 0,
};

describe('runReviewRecovery', () => {
  it('returns zero counters when there are no contexts on disk', async () => {
    const gateway = new StubReviewContextGateway();

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions: vi.fn(),
      now: () => NOW,
      logger: silentLogger(),
    });

    expect(summary).toEqual(EMPTY_SUMMARY);
  });

  it('skips contexts that do not match the predicate (no actions queued)', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-1',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-1',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [],
      }),
    );
    const executeActions = vi.fn();

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
    });

    expect(summary.skipped).toBe(1);
    expect(summary.recovered).toBe(0);
    expect(executeActions).not.toHaveBeenCalled();
  });

  it('backfills (no post) stale contexts older than the grace window', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-1',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-1',
        createdAt: ONE_HOUR_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'historical' }],
      }),
    );
    const executeActions = vi.fn();

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    });

    expect(summary.backfilled).toBe(1);
    expect(summary.recovered).toBe(0);
    expect(executeActions).not.toHaveBeenCalled();
    const result = gateway.read('/repo', 'github-owner/repo-1')?.result;
    expect(result?.kind).toBe('backfilled');
    if (result?.kind === 'backfilled') {
      expect(result.reason).toBe('stale-on-boot');
      expect(result.backfilledAt).toBeDefined();
    }
  });

  it('measures grace window from progress.updatedAt, not createdAt (long-running reviews)', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-long',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-long',
        createdAt: ONE_HOUR_AGO, // started > grace window ago
        progress: {
          phase: 'completed',
          currentStep: null,
          updatedAt: ONE_HOUR_AGO_TWO_MIN_HEARTBEAT, // but kept heartbeating 2 min ago
        },
        actions: [{ type: 'POST_COMMENT', body: 'long but fresh' }],
      }),
    );
    const executeActions = vi.fn().mockResolvedValue({ posted: 1, failed: 0 });

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    });

    expect(summary.recovered).toBe(1);
    expect(summary.backfilled).toBe(0);
    expect(executeActions).toHaveBeenCalledOnce();
  });

  it('recovers contexts inside the grace window by calling executeActions then finalizing', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-2',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-2',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'fresh' }],
      }),
    );
    const executeActions = vi.fn().mockResolvedValue({ posted: 1, failed: 0 });

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    });

    expect(summary.recovered).toBe(1);
    expect(summary.partial).toBe(0);
    expect(summary.backfilled).toBe(0);
    expect(executeActions).toHaveBeenCalledTimes(1);
    const result = gateway.read('/repo', 'github-owner/repo-2')?.result;
    expect(result?.kind).toBe('backfilled');
    if (result?.kind === 'backfilled') {
      expect(result.reason).toBe('recovered-after-restart');
    }
  });

  it('counts partial when some posts succeed and some fail, still finalizing to avoid double-post', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-partial',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-partial',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [
          { type: 'POST_INLINE_COMMENT', filePath: 'a.ts', line: 1, body: 'a' },
          { type: 'POST_INLINE_COMMENT', filePath: 'b.ts', line: 1, body: 'b' },
        ],
      }),
    );
    const executeActions = vi.fn().mockResolvedValue({ posted: 1, failed: 1 });

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    });

    expect(summary.partial).toBe(1);
    expect(summary.recovered).toBe(0);
    expect(summary.failed).toBe(0);
    expect(gateway.read('/repo', 'github-owner/repo-partial')?.result?.kind).toBe('backfilled');
  });

  it('leaves the context unfinalized when zero posts went through (safe to retry next boot)', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-zero',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-zero',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'unposted' }],
      }),
    );
    const executeActions = vi.fn().mockResolvedValue({ posted: 0, failed: 1 });

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    });

    expect(summary.failed).toBe(1);
    expect(summary.recovered).toBe(0);
    expect(gateway.read('/repo', 'github-owner/repo-zero')?.result).toBeUndefined();
  });

  it('counts a failure when executeActions throws and leaves result unset', async () => {
    const gateway = new StubReviewContextGateway();
    gateway.setContext(
      'github-owner/repo-3',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-3',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'flaky' }],
      }),
    );
    const executeActions = vi.fn().mockRejectedValue(new Error('gh api down'));

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    });

    expect(summary.failed).toBe(1);
    expect(summary.recovered).toBe(0);
    expect(gateway.read('/repo', 'github-owner/repo-3')?.result).toBeUndefined();
  });
});
