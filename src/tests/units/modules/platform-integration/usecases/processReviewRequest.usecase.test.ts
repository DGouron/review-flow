import { describe, it, expect, vi } from 'vitest';

import {
  processReviewRequest,
  type ProcessReviewRequestDependencies,
  type ProcessReviewRequestInput,
} from '@/modules/platform-integration/usecases/processReviewRequest.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { GateClaudeInvocationProcessor } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

const PROJECT_PATH = 'group/project';

function buildJob(): ReviewJob {
  return {
    id: 'gitlab-group/project-42',
    platform: 'gitlab',
    projectPath: PROJECT_PATH,
    localPath: '/checkout/project',
    mrNumber: 42,
    skill: 'review-front',
    mrUrl: 'https://gitlab.com/group/project/-/merge_requests/42',
    sourceBranch: 'feature/x',
    targetBranch: 'main',
    jobType: 'review',
  };
}

const noopProcessor: GateClaudeInvocationProcessor = async () => {};

function acceptedStatus(): BudgetStatus {
  return {
    limitUsd: 200,
    consumedUsd: 0,
    remainingUsd: 200,
    percentUsed: 0,
    exceeded: false,
    periodStart: '2026-05-01T00:00:00.000Z',
  };
}

function exceededStatus(): BudgetStatus {
  return {
    limitUsd: 200,
    consumedUsd: 250,
    remainingUsd: -50,
    percentUsed: 125,
    exceeded: true,
    periodStart: '2026-05-01T00:00:00.000Z',
  };
}

function buildInput(overrides: Partial<ProcessReviewRequestInput> = {}): ProcessReviewRequestInput {
  return {
    job: buildJob(),
    processor: noopProcessor,
    triggerSource: 'webhook-initial',
    localPaths: ['/checkout/project'],
    actorUsername: 'alice',
    projectPath: PROJECT_PATH,
    gateActorTrust: true,
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<ProcessReviewRequestDependencies> = {},
): ProcessReviewRequestDependencies {
  return {
    enforceBudget: { execute: vi.fn(async () => ({ accepted: true, status: acceptedStatus() })) },
    enqueue: vi.fn(async () => true),
    logger: createStubLogger(),
    ...overrides,
  };
}

describe('processReviewRequest', () => {
  describe('budget gate', () => {
    it('returns budget-exceeded with the budget status when the budget is refused', async () => {
      const deps = buildDeps({
        enforceBudget: {
          execute: vi.fn(async () => ({ accepted: false, status: exceededStatus() })),
        },
      });

      const verdict = await processReviewRequest(buildInput(), deps);

      expect(verdict).toEqual({ type: 'budget-exceeded', status: exceededStatus() });
    });

    it('does not enqueue when the budget is refused', async () => {
      const enqueue = vi.fn(async () => true);
      const deps = buildDeps({
        enforceBudget: {
          execute: vi.fn(async () => ({ accepted: false, status: exceededStatus() })),
        },
        enqueue,
      });

      await processReviewRequest(buildInput(), deps);

      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('gate path (gateClaudeInvocation wired)', () => {
    it('returns queued when the gate enqueues the job', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({
          status: 'enqueued' as const,
          jobId: 'gitlab-group/project-42',
        })),
      };
      const deps = buildDeps({ gateClaudeInvocation });

      const verdict = await processReviewRequest(buildInput(), deps);

      expect(verdict).toEqual({ type: 'queued', jobId: 'gitlab-group/project-42' });
    });

    it('returns pending with the pendingId when the gate parks the job (semi-auto)', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({ status: 'pending' as const, pendingId: 'pending-x' })),
      };
      const deps = buildDeps({ gateClaudeInvocation });

      const verdict = await processReviewRequest(buildInput(), deps);

      expect(verdict).toEqual({ type: 'pending', pendingId: 'pending-x' });
    });

    it('returns deduplicated when the gate rejects the job', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({ status: 'rejected' as const, reason: 'already-active' })),
      };
      const deps = buildDeps({ gateClaudeInvocation });

      const verdict = await processReviewRequest(buildInput(), deps);

      expect(verdict).toEqual({ type: 'deduplicated', jobId: 'gitlab-group/project-42' });
    });

    it('passes the resolved actor-trust verdict to the gate when actor trust is gated', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({ status: 'pending' as const, pendingId: 'pending-x' })),
      };
      const isTrustedActor = { execute: vi.fn(async () => false) };
      const deps = buildDeps({ gateClaudeInvocation, isTrustedActor });

      await processReviewRequest(buildInput({ gateActorTrust: true }), deps);

      expect(isTrustedActor.execute).toHaveBeenCalledWith({
        username: 'alice',
        projectPath: PROJECT_PATH,
      });
      expect(gateClaudeInvocation.execute).toHaveBeenCalledWith(
        expect.objectContaining({ actorTrusted: false, triggerSource: 'webhook-initial' }),
      );
    });

    it('does not resolve actor trust when the trust gate is disabled', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({
          status: 'enqueued' as const,
          jobId: 'gitlab-group/project-42',
        })),
      };
      const isTrustedActor = { execute: vi.fn(async () => false) };
      const deps = buildDeps({ gateClaudeInvocation, isTrustedActor });

      await processReviewRequest(buildInput({ gateActorTrust: false }), deps);

      expect(isTrustedActor.execute).not.toHaveBeenCalled();
      expect(gateClaudeInvocation.execute).toHaveBeenCalledWith(
        expect.objectContaining({ actorTrusted: true }),
      );
    });
  });

  describe('no-gate raw-enqueue fallback (gateClaudeInvocation undefined)', () => {
    it('returns queued when the raw enqueue accepts the job', async () => {
      const enqueue = vi.fn(async () => true);
      const deps = buildDeps({ enqueue });

      const verdict = await processReviewRequest(buildInput({ gateActorTrust: false }), deps);

      expect(verdict).toEqual({ type: 'queued', jobId: 'gitlab-group/project-42' });
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'gitlab-group/project-42' }),
        noopProcessor,
      );
    });

    it('returns deduplicated when the raw enqueue refuses the job', async () => {
      const enqueue = vi.fn(async () => false);
      const deps = buildDeps({ enqueue });

      const verdict = await processReviewRequest(buildInput({ gateActorTrust: false }), deps);

      expect(verdict).toEqual({ type: 'deduplicated', jobId: 'gitlab-group/project-42' });
    });

    it('parks an untrusted actor as pending without a pendingId before enqueuing', async () => {
      const enqueue = vi.fn(async () => true);
      const isTrustedActor = { execute: vi.fn(async () => false) };
      const deps = buildDeps({ enqueue, isTrustedActor });

      const verdict = await processReviewRequest(buildInput({ gateActorTrust: true }), deps);

      expect(verdict).toEqual({ type: 'pending', pendingId: null, reason: 'untrusted-actor' });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('enqueues a trusted actor through the raw fallback when actor trust is gated', async () => {
      const enqueue = vi.fn(async () => true);
      const isTrustedActor = { execute: vi.fn(async () => true) };
      const deps = buildDeps({ enqueue, isTrustedActor });

      const verdict = await processReviewRequest(buildInput({ gateActorTrust: true }), deps);

      expect(verdict).toEqual({ type: 'queued', jobId: 'gitlab-group/project-42' });
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
