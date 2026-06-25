import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewRequestStateValue } from '@/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface Harness {
  app: FastifyInstance;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
  contextGateway: StubReviewContextGateway;
  cancelJob: ReturnType<typeof vi.fn>;
}

const projectPath = '/home/user/proj';

async function buildHarness(): Promise<Harness> {
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const contextGateway = new StubReviewContextGateway();
  const capturing = createCapturingLogger();
  const cancelJob = vi.fn((_jobId: string): boolean => false);

  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: trackingGateway,
    getQualityThreshold: () => null,
    reviewContextGateway: contextGateway,
    cancelJob,
    buildJobId: (platform: string, path: string, mrNumber: number): string =>
      `${platform}:${path}:${mrNumber}`,
    removeWorktree: async (): Promise<RemoveResult> => ({ status: 'removed' }),
    logger: capturing.logger,
  });

  return { app, trackingGateway, contextGateway, cancelJob };
}

function seedMr(harness: Harness, state: ReviewRequestStateValue): void {
  harness.trackingGateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-42', state }));
}

describe('mrTrackingRoutes — POST /api/mr-tracking/mark-as-merged (SPEC-215)', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  it('marks a pending-approval review as merged → 200', async () => {
    seedMr(harness, 'pending-approval');

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-42', projectPath },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; mrId: string; message: string };
    expect(body.success).toBe(true);
    expect(body.mrId).toBe('mr-42');
    expect(harness.trackingGateway.getById(projectPath, 'mr-42')?.state).toBe('merged');
  });

  it('marks an approved review as merged → 200 (no current-state restriction)', async () => {
    seedMr(harness, 'approved');

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-42', projectPath },
    });

    expect(response.statusCode).toBe(200);
    expect(harness.trackingGateway.getById(projectPath, 'mr-42')?.state).toBe('merged');
  });

  it('returns 404 with a French message for an unknown review', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'ghost', projectPath },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('MR non trouvée');
  });

  it('rejects an empty review id with 400 "mrId requis"', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: '', projectPath },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('mrId requis');
  });

  it('rejects an invalid project path with 400 "Chemin invalide"', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-42', projectPath: '../etc' },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('Chemin invalide');
  });
});

describe('mrTrackingRoutes — GET /api/mr-tracking exposes the merged list (SPEC-215)', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  it('returns merged reviews under a "merged" field', async () => {
    seedMr(harness, 'pending-fix');
    await harness.app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-42', projectPath },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/mr-tracking?path=${encodeURIComponent(projectPath)}`,
    });

    const body = response.json() as { success: boolean; merged: Array<{ id: string }> };
    expect(body.success).toBe(true);
    expect(body.merged.map((mr) => mr.id)).toContain('mr-42');
  });
});
