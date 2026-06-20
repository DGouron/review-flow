import { describe, it, expect } from 'vitest';

import {
  handleClose,
  type HandleCloseDependencies,
} from '@/modules/review-execution/usecases/handleClose.usecase.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface Harness {
  deps: HandleCloseDependencies;
  cancelledJobIds: string[];
  builtJobIds: string[];
  removeWorktreeCalls: Array<{ identity: { platform: Platform } }>;
  contextGateway: StubReviewContextGateway;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
}

function buildHarness(overrides?: Partial<HandleCloseDependencies>): Harness {
  const contextGateway = new StubReviewContextGateway();
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const cancelledJobIds: string[] = [];
  const builtJobIds: string[] = [];
  const removeWorktreeCalls: Array<{ identity: { platform: Platform } }> = [];

  const deps: HandleCloseDependencies = {
    trackingGateway,
    reviewContextGateway: contextGateway,
    cancelJob: (jobId) => {
      cancelledJobIds.push(jobId);
      return true;
    },
    buildJobId: (platform, projectPath, mrNumber) => {
      const jobId = `${platform}:${projectPath}:${mrNumber}`;
      builtJobIds.push(jobId);
      return jobId;
    },
    removeWorktree: async ({ identity }): Promise<RemoveResult> => {
      removeWorktreeCalls.push({ identity });
      return { status: 'removed' };
    },
    logger: createStubLogger(),
    ...overrides,
  };

  return {
    deps,
    cancelledJobIds,
    builtJobIds,
    removeWorktreeCalls,
    contextGateway,
    trackingGateway,
  };
}

describe('SPEC-073 Stage 2 — handleClose (acceptance)', () => {
  describe('one shared handleClose drives both GitLab MR close and GitHub PR close', () => {
    it('gitlab close: cancels job, archives tracking, deletes context, removes worktree', async () => {
      const harness = buildHarness();

      const result = await handleClose(
        {
          platform: 'gitlab',
          projectPath: 'group/project',
          localPath: '/checkout/project',
          mergeRequestNumber: 42,
        },
        harness.deps,
      );

      expect(result.status).toBe('cleaned');
      expect(harness.cancelledJobIds).toEqual(['gitlab:group/project:42']);
      expect(harness.removeWorktreeCalls[0].identity.platform).toBe('gitlab');
    });

    it('github close: builds a github-prefixed merge request id', async () => {
      const harness = buildHarness();
      harness.contextGateway.setContext(
        'github-org/repo-7',
        ReviewContextFactory.create({ mergeRequestId: 'github-org/repo-7' }),
      );

      const result = await handleClose(
        {
          platform: 'github',
          projectPath: 'org/repo',
          localPath: '/checkout/repo',
          mergeRequestNumber: 7,
        },
        harness.deps,
      );

      expect(result.status).toBe('cleaned');
      expect(harness.removeWorktreeCalls[0].identity.platform).toBe('github');
    });
  });

  describe('cleanup is best-effort: worktree failure never fails the cleanup', () => {
    it('returns cleaned even when worktree removal reports failure', async () => {
      const harness = buildHarness({
        removeWorktree: async (): Promise<RemoveResult> => ({
          status: 'failed',
          warning: 'boom',
        }),
      });

      const result = await handleClose(
        {
          platform: 'gitlab',
          projectPath: 'group/project',
          localPath: '/checkout/project',
          mergeRequestNumber: 42,
        },
        harness.deps,
      );

      expect(result.status).toBe('cleaned');
    });

    it('returns cleaned even when worktree removal throws', async () => {
      const harness = buildHarness({
        removeWorktree: async (): Promise<RemoveResult> => {
          throw new Error('exploded');
        },
      });

      const result = await handleClose(
        {
          platform: 'github',
          projectPath: 'org/repo',
          localPath: '/checkout/repo',
          mergeRequestNumber: 7,
        },
        harness.deps,
      );

      expect(result.status).toBe('cleaned');
    });
  });

  describe('each effect reports its own outcome independently', () => {
    it('reports false outcomes when nothing was tracked or cancelled', async () => {
      const harness = buildHarness({
        cancelJob: () => false,
      });

      const result = await handleClose(
        {
          platform: 'gitlab',
          projectPath: 'group/project',
          localPath: '/checkout/project',
          mergeRequestNumber: 99,
        },
        harness.deps,
      );

      expect(result.status).toBe('cleaned');
      expect(result.jobCancelled).toBe(false);
      expect(result.trackingArchived).toBe(false);
      expect(result.contextDeleted).toBe(false);
    });
  });
});
