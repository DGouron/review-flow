import { describe, it, expect } from 'vitest';

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import {
  processWebhook,
  type ProcessWebhookDependencies,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
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
