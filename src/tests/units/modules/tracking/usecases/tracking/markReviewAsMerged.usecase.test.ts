import { describe, it, expect, vi } from 'vitest';

import type { ReviewRequestStateValue } from '@/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.js';
import {
  MarkReviewAsMergedUseCase,
  type MarkReviewAsMergedDependencies,
} from '@/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface Harness {
  useCase: MarkReviewAsMergedUseCase;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
  contextGateway: StubReviewContextGateway;
  cancelJob: ReturnType<typeof vi.fn>;
  buildJobId: ReturnType<typeof vi.fn>;
  removeWorktree: ReturnType<typeof vi.fn>;
  warnMessages: string[];
}

const projectPath = '/home/user/proj';

function buildHarness(overrides?: Partial<MarkReviewAsMergedDependencies>): Harness {
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const contextGateway = new StubReviewContextGateway();
  const capturing = createCapturingLogger();

  const cancelJob = vi.fn((_jobId: string): boolean => false);
  const buildJobId = vi.fn(
    (platform: string, path: string, mrNumber: number): string => `${platform}:${path}:${mrNumber}`,
  );
  const removeWorktree = vi.fn(async (): Promise<RemoveResult> => ({ status: 'removed' }));

  const deps: MarkReviewAsMergedDependencies = {
    trackingGateway,
    reviewContextGateway: contextGateway,
    cancelJob,
    buildJobId,
    removeWorktree,
    logger: capturing.logger,
    ...overrides,
  };

  return {
    useCase: new MarkReviewAsMergedUseCase(deps),
    trackingGateway,
    contextGateway,
    cancelJob,
    buildJobId,
    removeWorktree,
    warnMessages: capturing.warnMessages,
  };
}

function seedMr(
  harness: Harness,
  state: ReviewRequestStateValue,
  overrides: Parameters<typeof TrackedMrFactory.create>[0] = {},
): void {
  harness.trackingGateway.create(
    projectPath,
    TrackedMrFactory.create({ id: 'mr-42', state, ...overrides }),
  );
}

describe('MarkReviewAsMergedUseCase', () => {
  const states: ReviewRequestStateValue[] = [
    'pending-review',
    'pending-fix',
    'pending-approval',
    'approved',
    'closed',
  ];

  for (const state of states) {
    it(`transitions a ${state} review to merged with a mergedAt timestamp`, async () => {
      const harness = buildHarness();
      seedMr(harness, state);

      const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

      expect(result.ok).toBe(true);
      const updated = harness.trackingGateway.getById(projectPath, 'mr-42');
      expect(updated?.state).toBe('merged');
      expect(updated?.mergedAt).not.toBeNull();
    });
  }

  it('retains the record instead of archiving it', async () => {
    const harness = buildHarness();
    seedMr(harness, 'pending-fix');
    const archiveSpy = vi.spyOn(harness.trackingGateway, 'archive');
    const removeSpy = vi.spyOn(harness.trackingGateway, 'remove');

    const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(result).toEqual({
      ok: true,
      jobCancelled: false,
      contextReleased: false,
      recordRetained: true,
    });
    expect(archiveSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(harness.trackingGateway.getById(projectPath, 'mr-42')).not.toBeNull();
  });

  it('cancels the running job using the built job id', async () => {
    const harness = buildHarness();
    harness.cancelJob.mockReturnValue(true);
    seedMr(harness, 'pending-review', { platform: 'gitlab', mrNumber: 7 });

    const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(result.ok && result.jobCancelled).toBe(true);
    expect(harness.buildJobId).toHaveBeenCalledWith('gitlab', projectPath, 7);
    expect(harness.cancelJob).toHaveBeenCalledWith(`gitlab:${projectPath}:7`);
  });

  it('releases the review context keyed by the project path and the stored id', async () => {
    const harness = buildHarness();
    seedMr(harness, 'pending-fix');
    harness.contextGateway.setContext(
      'mr-42',
      ReviewContextFactory.create({ mergeRequestId: 'mr-42' }),
    );
    const deleteSpy = vi.spyOn(harness.contextGateway, 'delete');

    const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(result.ok && result.contextReleased).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(projectPath, 'mr-42');
  });

  it('removes the worktree with the project path as identity and source checkout', async () => {
    const harness = buildHarness();
    seedMr(harness, 'pending-fix', { platform: 'github', mrNumber: 9 });

    await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(harness.removeWorktree).toHaveBeenCalledWith({
      identity: { platform: 'github', projectPath, mrNumber: 9 },
      sourceCheckoutPath: projectPath,
    });
  });

  it('stays merged and succeeds when the review is already merged (idempotent)', async () => {
    const harness = buildHarness();
    seedMr(harness, 'merged', { mergedAt: '2026-01-01T00:00:00.000Z' });

    const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(result.ok).toBe(true);
    const updated = harness.trackingGateway.getById(projectPath, 'mr-42');
    expect(updated?.state).toBe('merged');
    expect(harness.cancelJob).not.toHaveBeenCalled();
  });

  it('marks merged even when worktree removal reports a failure (best-effort)', async () => {
    const harness = buildHarness({
      removeWorktree: vi.fn(
        async (): Promise<RemoveResult> => ({ status: 'failed', warning: 'boom' }),
      ),
    });
    seedMr(harness, 'pending-fix');

    const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(result.ok).toBe(true);
    expect(harness.trackingGateway.getById(projectPath, 'mr-42')?.state).toBe('merged');
    expect(harness.warnMessages.some((message) => message.includes('boom'))).toBe(true);
  });

  it('marks merged even when worktree removal throws (best-effort)', async () => {
    const harness = buildHarness({
      removeWorktree: vi.fn(async (): Promise<RemoveResult> => {
        throw new Error('exploded');
      }),
    });
    seedMr(harness, 'pending-fix');

    const result = await harness.useCase.execute({ projectPath, mrId: 'mr-42' });

    expect(result.ok).toBe(true);
    expect(harness.trackingGateway.getById(projectPath, 'mr-42')?.state).toBe('merged');
    expect(harness.warnMessages.some((message) => message.includes('exploded'))).toBe(true);
  });

  it('returns not-found when the review does not exist', async () => {
    const harness = buildHarness();

    const result = await harness.useCase.execute({ projectPath, mrId: 'ghost' });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(harness.cancelJob).not.toHaveBeenCalled();
  });
});
