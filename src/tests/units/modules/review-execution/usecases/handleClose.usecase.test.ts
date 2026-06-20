import { describe, it, expect, vi } from 'vitest';

import {
  handleClose,
  type HandleCloseDependencies,
  type HandleCloseInput,
} from '@/modules/review-execution/usecases/handleClose.usecase.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface Harness {
  deps: HandleCloseDependencies;
  cancelJob: ReturnType<typeof vi.fn>;
  buildJobId: ReturnType<typeof vi.fn>;
  removeWorktree: ReturnType<typeof vi.fn>;
  contextGateway: StubReviewContextGateway;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
  warnMessages: string[];
}

function buildHarness(overrides?: Partial<HandleCloseDependencies>): Harness {
  const contextGateway = new StubReviewContextGateway();
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const capturing = createCapturingLogger();

  const cancelJob = vi.fn((_jobId: string): boolean => true);
  const buildJobId = vi.fn(
    (platform: string, projectPath: string, mrNumber: number): string =>
      `${platform}:${projectPath}:${mrNumber}`,
  );
  const removeWorktree = vi.fn(async (): Promise<RemoveResult> => ({ status: 'removed' }));

  const deps: HandleCloseDependencies = {
    trackingGateway,
    reviewContextGateway: contextGateway,
    cancelJob,
    buildJobId,
    removeWorktree,
    logger: capturing.logger,
    ...overrides,
  };

  return {
    deps,
    cancelJob,
    buildJobId,
    removeWorktree,
    contextGateway,
    trackingGateway,
    warnMessages: capturing.warnMessages,
  };
}

const gitlabInput: HandleCloseInput = {
  platform: 'gitlab',
  projectPath: 'group/project',
  localPath: '/checkout/project',
  mergeRequestNumber: 42,
};

describe('handleClose', () => {
  it('cancels the job, deletes the context, removes the worktree and returns cleaned', async () => {
    const harness = buildHarness();
    harness.contextGateway.setContext(
      'gitlab-group/project-42',
      ReviewContextFactory.create({ mergeRequestId: 'gitlab-group/project-42' }),
    );

    const result = await handleClose(gitlabInput, harness.deps);

    expect(result).toEqual({
      status: 'cleaned',
      jobCancelled: true,
      trackingArchived: false,
      contextDeleted: true,
    });
    expect(harness.cancelJob).toHaveBeenCalledWith('gitlab:group/project:42');
    expect(harness.removeWorktree).toHaveBeenCalledWith({
      identity: { platform: 'gitlab', projectPath: 'group/project', mrNumber: 42 },
      sourceCheckoutPath: '/checkout/project',
    });
  });

  it('builds the job id via the injected buildJobId with platform, project path and number', async () => {
    const harness = buildHarness();

    await handleClose(gitlabInput, harness.deps);

    expect(harness.buildJobId).toHaveBeenCalledWith('gitlab', 'group/project', 42);
  });

  it('reports jobCancelled false when no running job was cancelled', async () => {
    const harness = buildHarness({ cancelJob: () => false });

    const result = await handleClose(gitlabInput, harness.deps);

    expect(result.jobCancelled).toBe(false);
  });

  it('reports trackingArchived false when the request was not tracked', async () => {
    const harness = buildHarness();

    const result = await handleClose(gitlabInput, harness.deps);

    expect(result.trackingArchived).toBe(false);
  });

  it('reports contextDeleted false when no context file existed', async () => {
    const harness = buildHarness();

    const result = await handleClose(gitlabInput, harness.deps);

    expect(result.contextDeleted).toBe(false);
  });

  it('warns and still returns cleaned when worktree removal reports failure', async () => {
    const harness = buildHarness({
      removeWorktree: vi.fn(
        async (): Promise<RemoveResult> => ({
          status: 'failed',
          warning: 'boom',
        }),
      ),
    });

    const result = await handleClose(gitlabInput, harness.deps);

    expect(result.status).toBe('cleaned');
    expect(harness.warnMessages.some((message) => message.includes('boom'))).toBe(true);
  });

  it('warns and still returns cleaned when worktree removal throws', async () => {
    const harness = buildHarness({
      removeWorktree: vi.fn(async (): Promise<RemoveResult> => {
        throw new Error('exploded');
      }),
    });

    const result = await handleClose(gitlabInput, harness.deps);

    expect(result.status).toBe('cleaned');
    expect(harness.warnMessages.some((message) => message.includes('exploded'))).toBe(true);
  });

  it('archives tracking and deletes context with the gitlab-prefixed merge request id', async () => {
    const harness = buildHarness();
    const deleteSpy = vi.spyOn(harness.contextGateway, 'delete');
    const archiveSpy = vi.spyOn(harness.trackingGateway, 'archive');

    await handleClose(gitlabInput, harness.deps);

    expect(deleteSpy).toHaveBeenCalledWith('/checkout/project', 'gitlab-group/project-42');
    expect(archiveSpy).toHaveBeenCalledWith('/checkout/project', 'gitlab-group/project-42');
  });

  it('builds a github-prefixed merge request id and identity for github closes', async () => {
    const harness = buildHarness();
    const deleteSpy = vi.spyOn(harness.contextGateway, 'delete');

    await handleClose(
      {
        platform: 'github',
        projectPath: 'org/repo',
        localPath: '/checkout/repo',
        mergeRequestNumber: 7,
      },
      harness.deps,
    );

    expect(deleteSpy).toHaveBeenCalledWith('/checkout/repo', 'github-org/repo-7');
    expect(harness.removeWorktree).toHaveBeenCalledWith({
      identity: { platform: 'github', projectPath: 'org/repo', mrNumber: 7 },
      sourceCheckoutPath: '/checkout/repo',
    });
  });
});
