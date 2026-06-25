/**
 * SPEC-215 — Mark any review as merged
 *
 * Outer-loop acceptance test (SDD): exercises POST /api/mr-tracking/mark-as-merged
 * through the Fastify plugin wired with the in-memory tracking gateway, the stub
 * review-context gateway and spy closure collaborators (cancelJob / buildJobId /
 * removeWorktree). Covers the 12 scenarios from docs/specs/215-mark-any-review-as-merged.md.
 *
 * Stays RED until the whole slice (use case + route + wiring) is GREEN.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewRequestStateValue } from '@/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface Harness {
  app: FastifyInstance;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
  contextGateway: StubReviewContextGateway;
  cancelJob: ReturnType<typeof vi.fn>;
  buildJobId: ReturnType<typeof vi.fn>;
  removeWorktree: ReturnType<typeof vi.fn>;
}

async function buildHarness(overrides?: {
  cancelJob?: (jobId: string) => boolean;
  removeWorktree?: () => Promise<RemoveResult>;
}): Promise<Harness> {
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const contextGateway = new StubReviewContextGateway();
  const capturing = createCapturingLogger();

  const cancelJob = vi.fn(overrides?.cancelJob ?? ((_jobId: string): boolean => false));
  const buildJobId = vi.fn(
    (platform: string, projectPath: string, mrNumber: number): string =>
      `${platform}:${projectPath}:${mrNumber}`,
  );
  const removeWorktree = vi.fn(
    overrides?.removeWorktree ?? (async (): Promise<RemoveResult> => ({ status: 'removed' })),
  );

  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: trackingGateway,
    getQualityThreshold: () => null,
    reviewContextGateway: contextGateway,
    cancelJob,
    buildJobId,
    removeWorktree,
    logger: capturing.logger,
  });

  return { app, trackingGateway, contextGateway, cancelJob, buildJobId, removeWorktree };
}

const projectPath = '/home/user/proj';

function seedMr(harness: Harness, overrides: Partial<TrackedMr>): void {
  harness.trackingGateway.create(
    projectPath,
    TrackedMrFactory.create({ id: 'mr-42', ...overrides }),
  );
}

async function markAsMerged(
  harness: Harness,
  payload: { mrId?: string; projectPath?: string },
): Promise<{ statusCode: number; body: { success: boolean; mrId?: string; error?: string } }> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/mr-tracking/mark-as-merged',
    payload,
  });
  return {
    statusCode: response.statusCode,
    body: response.json() as { success: boolean; mrId?: string; error?: string },
  };
}

describe('Acceptance — SPEC-215: Mark any review as merged', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  describe('Rule: a review can be marked as merged from any state', () => {
    const states: ReviewRequestStateValue[] = [
      'pending-review',
      'pending-fix',
      'pending-approval',
      'approved',
      'closed',
    ];

    for (const state of states) {
      it(`from ${state} → 200, state "merged" + mergedAt set`, async () => {
        seedMr(harness, { state });

        const { statusCode, body } = await markAsMerged(harness, { mrId: 'mr-42', projectPath });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.mrId).toBe('mr-42');
        const updated = harness.trackingGateway.getById(projectPath, 'mr-42');
        expect(updated?.state).toBe('merged');
        expect(updated?.mergedAt).not.toBeNull();
      });
    }
  });

  describe('Rule: marking an already-merged review is idempotent', () => {
    it('already merged → 200, stays merged', async () => {
      seedMr(harness, { state: 'merged', mergedAt: '2026-01-01T00:00:00.000Z' });

      const { statusCode, body } = await markAsMerged(harness, { mrId: 'mr-42', projectPath });

      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      const updated = harness.trackingGateway.getById(projectPath, 'mr-42');
      expect(updated?.state).toBe('merged');
    });
  });

  describe('Rule: marking as merged closes the review process', () => {
    it('cancels a running job and releases the context', async () => {
      seedMr(harness, { state: 'pending-review', platform: 'gitlab', mrNumber: 42 });
      harness.contextGateway.setContext(
        'mr-42',
        ReviewContextFactory.create({ mergeRequestId: 'mr-42' }),
      );
      harness.cancelJob.mockReturnValue(true);

      const { statusCode, body } = await markAsMerged(harness, { mrId: 'mr-42', projectPath });

      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(harness.buildJobId).toHaveBeenCalledWith('gitlab', projectPath, 42);
      expect(harness.cancelJob).toHaveBeenCalledWith(`gitlab:${projectPath}:42`);
      expect(harness.contextGateway.exists(projectPath, 'mr-42')).toBe(false);
    });

    it('best-effort worktree removal failure does not block the merge', async () => {
      harness = await buildHarness({
        removeWorktree: async () => ({ status: 'failed', warning: 'boom' }),
      });
      seedMr(harness, { state: 'pending-fix' });

      const { statusCode, body } = await markAsMerged(harness, { mrId: 'mr-42', projectPath });

      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      const updated = harness.trackingGateway.getById(projectPath, 'mr-42');
      expect(updated?.state).toBe('merged');
    });
  });

  describe('Rule: the merged record is retained and surfaced', () => {
    it('keeps the record and lists it under the merged list', async () => {
      seedMr(harness, { state: 'pending-fix' });

      await markAsMerged(harness, { mrId: 'mr-42', projectPath });

      const retained = harness.trackingGateway.getById(projectPath, 'mr-42');
      expect(retained).not.toBeNull();
      expect(retained?.state).toBe('merged');

      const trackingResponse = await harness.app.inject({
        method: 'GET',
        url: `/api/mr-tracking?path=${encodeURIComponent(projectPath)}`,
      });
      const trackingBody = trackingResponse.json() as {
        merged: Array<{ id: string }>;
      };
      expect(trackingBody.merged.map((mr) => mr.id)).toContain('mr-42');
    });
  });

  describe('Rule: the action requires a known review and valid inputs', () => {
    it('unknown review → 404 "MR non trouvée"', async () => {
      const { statusCode, body } = await markAsMerged(harness, { mrId: 'ghost', projectPath });

      expect(statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe('MR non trouvée');
    });

    it('missing review id → 400 "mrId requis"', async () => {
      const { statusCode, body } = await markAsMerged(harness, { mrId: '', projectPath });

      expect(statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('mrId requis');
    });

    it('missing project path → 400 "Chemin du projet requis"', async () => {
      const { statusCode, body } = await markAsMerged(harness, { mrId: 'mr-42', projectPath: '' });

      expect(statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Chemin du projet requis');
    });

    it('invalid project path → 400 "Chemin invalide"', async () => {
      const { statusCode, body } = await markAsMerged(harness, {
        mrId: 'mr-42',
        projectPath: '../etc',
      });

      expect(statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Chemin invalide');
    });
  });
});
