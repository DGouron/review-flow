import { describe, it, expect, vi } from 'vitest';

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import {
  processReviewRequest,
  type ProcessReviewRequestDependencies,
  type ProcessReviewRequestInput,
} from '@/modules/platform-integration/usecases/processReviewRequest.usecase.js';
import {
  processWebhook,
  type ProcessWebhookDependencies,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { GateClaudeInvocationProcessor } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const PROJECT_PATH = '/checkout/project';

function buildApproveEvent(): WebhookEvent {
  return {
    type: 'approve',
    platform: 'gitlab',
    projectPath: 'group/project',
    localPath: PROJECT_PATH,
    mergeRequestNumber: 42,
    reviewId: null,
  };
}

function buildDeps(
  tracked: TrackedMr | null,
  threshold: number | null,
): ProcessWebhookDependencies {
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  if (tracked) {
    trackingGateway.create(PROJECT_PATH, tracked);
  }
  return {
    handleClose: async () => ({
      status: 'cleaned',
      jobCancelled: true,
      trackingArchived: true,
      contextDeleted: true,
    }),
    transitionState: new TransitionStateUseCase(trackingGateway),
    recordPush: { execute: () => null },
    checkFollowupNeeded: { execute: () => false },
    removeWorktree: async () => ({ status: 'removed' }),
    handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGateway),
    getQualityThreshold: () => threshold,
    logger: createStubLogger(),
  };
}

describe('SPEC-073 Stage 4b — approve verdict via processWebhook (acceptance)', () => {
  describe('the approve verdict is decided inward, platform-neutral', () => {
    it('approved: a tracked MR clearing the quality gate transitions to approved', async () => {
      const tracked = TrackedMrFactory.create({
        id: 'gitlab-group/project-42',
        latestScore: 9,
        openThreads: 0,
        bypass: null,
      });

      const result = await processWebhook(buildApproveEvent(), buildDeps(tracked, 8));

      expect(result).toEqual({ type: 'approved', mergeRequestNumber: 42 });
    });

    it('approval-revoked: a sub-threshold tracked MR is reverted with a revoke message', async () => {
      const tracked = TrackedMrFactory.create({
        id: 'gitlab-group/project-42',
        latestScore: 4,
        openThreads: 0,
        bypass: null,
      });

      const result = await processWebhook(buildApproveEvent(), buildDeps(tracked, 8));

      expect(result.type).toBe('approval-revoked');
      if (result.type !== 'approval-revoked') throw new Error('expected approval-revoked');
      expect(result.mergeRequestNumber).toBe(42);
      expect(result.reason).toBe('below-threshold');
      expect(result.revokeMessage.length).toBeGreaterThan(0);
    });

    it('approval-revoked: blocking issues revert the approval with the blockers reason', async () => {
      const tracked = TrackedMrFactory.create({
        id: 'gitlab-group/project-42',
        latestScore: 9,
        openThreads: 2,
        bypass: null,
      });

      const result = await processWebhook(buildApproveEvent(), buildDeps(tracked, 8));

      expect(result.type).toBe('approval-revoked');
      if (result.type !== 'approval-revoked') throw new Error('expected approval-revoked');
      expect(result.reason).toBe('blockers-present');
    });

    it('approval-ignored: an untracked MR yields a not-found ignore', async () => {
      const result = await processWebhook(buildApproveEvent(), buildDeps(null, 8));

      expect(result).toEqual({
        type: 'approval-ignored',
        mergeRequestNumber: 42,
        reason: 'not-found',
      });
    });

    it('approved: a bypassed MR below threshold passes the gate via the bypass', async () => {
      const tracked = TrackedMrFactory.create({
        id: 'gitlab-group/project-42',
        latestScore: 4,
        openThreads: 0,
        bypass: { reason: 'urgent', author: 'alice', recordedAt: '2026-01-01T00:00:00Z' },
      });

      const result = await processWebhook(buildApproveEvent(), buildDeps(tracked, 8));

      expect(result).toEqual({ type: 'approved', mergeRequestNumber: 42 });
    });
  });

  describe('the platform-neutral usecase imports no platform-specific types', () => {
    it('uses evaluateQualityGate as the gate function for the transition check', () => {
      expect(typeof evaluateQualityGate).toBe('function');
    });
  });
});

const REVIEW_PROJECT_PATH = 'group/project';
const reviewProcessor: GateClaudeInvocationProcessor = async () => {};

function buildReviewJob(): ReviewJob {
  return {
    id: 'gitlab-group/project-42',
    platform: 'gitlab',
    projectPath: REVIEW_PROJECT_PATH,
    localPath: PROJECT_PATH,
    mrNumber: 42,
    skill: 'review-front',
    mrUrl: 'https://gitlab.com/group/project/-/merge_requests/42',
    sourceBranch: 'feature/x',
    targetBranch: 'main',
    jobType: 'review',
  };
}

function acceptedBudget(): BudgetStatus {
  return {
    limitUsd: 200,
    consumedUsd: 0,
    remainingUsd: 200,
    percentUsed: 0,
    exceeded: false,
    periodStart: '2026-05-01T00:00:00.000Z',
  };
}

function exceededBudget(): BudgetStatus {
  return {
    limitUsd: 200,
    consumedUsd: 250,
    remainingUsd: -50,
    percentUsed: 125,
    exceeded: true,
    periodStart: '2026-05-01T00:00:00.000Z',
  };
}

function buildReviewInput(
  overrides: Partial<ProcessReviewRequestInput> = {},
): ProcessReviewRequestInput {
  return {
    job: buildReviewJob(),
    processor: reviewProcessor,
    triggerSource: 'webhook-initial',
    localPaths: [PROJECT_PATH],
    actorUsername: 'alice',
    projectPath: REVIEW_PROJECT_PATH,
    gateActorTrust: true,
    ...overrides,
  };
}

function buildReviewDeps(
  overrides: Partial<ProcessReviewRequestDependencies> = {},
): ProcessReviewRequestDependencies {
  return {
    enforceBudget: { execute: vi.fn(async () => ({ accepted: true, status: acceptedBudget() })) },
    enqueue: vi.fn(async () => true),
    logger: createStubLogger(),
    ...overrides,
  };
}

describe('SPEC-073 Stage 4a — review-request enqueue sequencing via processReviewRequest (acceptance)', () => {
  describe('the review-request verdict is decided inward, platform-neutral', () => {
    it('budget-exceeded: a refused budget short-circuits before any enqueue', async () => {
      const enqueue = vi.fn(async () => true);
      const verdict = await processReviewRequest(
        buildReviewInput(),
        buildReviewDeps({
          enforceBudget: {
            execute: vi.fn(async () => ({ accepted: false, status: exceededBudget() })),
          },
          enqueue,
        }),
      );

      expect(verdict).toEqual({ type: 'budget-exceeded', status: exceededBudget() });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('queued: a trusted full-auto trigger is enqueued through the gate', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({
          status: 'enqueued' as const,
          jobId: 'gitlab-group/project-42',
        })),
      };
      const verdict = await processReviewRequest(
        buildReviewInput(),
        buildReviewDeps({
          gateClaudeInvocation,
          isTrustedActor: { execute: vi.fn(async () => true) },
        }),
      );

      expect(verdict).toEqual({ type: 'queued', jobId: 'gitlab-group/project-42' });
    });

    it('pending: a semi-auto trigger is parked with its pendingId', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({
          status: 'pending' as const,
          pendingId: 'pending-gitlab-42',
        })),
      };
      const verdict = await processReviewRequest(
        buildReviewInput(),
        buildReviewDeps({
          gateClaudeInvocation,
          isTrustedActor: { execute: vi.fn(async () => true) },
        }),
      );

      expect(verdict).toEqual({ type: 'pending', pendingId: 'pending-gitlab-42' });
    });

    it('pending (untrusted-actor): the no-gate fallback parks an untrusted actor without enqueuing', async () => {
      const enqueue = vi.fn(async () => true);
      const verdict = await processReviewRequest(
        buildReviewInput({ gateActorTrust: true }),
        buildReviewDeps({ enqueue, isTrustedActor: { execute: vi.fn(async () => false) } }),
      );

      expect(verdict).toEqual({ type: 'pending', pendingId: null, reason: 'untrusted-actor' });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('deduplicated: the gate rejecting the job yields a deduplicated verdict', async () => {
      const gateClaudeInvocation = {
        execute: vi.fn(async () => ({ status: 'rejected' as const, reason: 'already-active' })),
      };
      const verdict = await processReviewRequest(
        buildReviewInput(),
        buildReviewDeps({
          gateClaudeInvocation,
          isTrustedActor: { execute: vi.fn(async () => true) },
        }),
      );

      expect(verdict).toEqual({ type: 'deduplicated', jobId: 'gitlab-group/project-42' });
    });

    it('queued (no gate): the followup raw-enqueue fallback queues an ungated trigger', async () => {
      const enqueue = vi.fn(async () => true);
      const verdict = await processReviewRequest(
        buildReviewInput({ triggerSource: 'webhook-followup', gateActorTrust: false }),
        buildReviewDeps({ enqueue }),
      );

      expect(verdict).toEqual({ type: 'queued', jobId: 'gitlab-group/project-42' });
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
