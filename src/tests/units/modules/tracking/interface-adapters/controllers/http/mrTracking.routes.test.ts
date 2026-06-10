import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface BuildAppOptions {
  gateway: InMemoryReviewRequestTrackingGateway;
  qualityThreshold: number | null;
}

async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: options.gateway,
    getQualityThreshold: () => options.qualityThreshold,
  });
  return app;
}

describe('mrTrackingRoutes — POST /api/mr-tracking/approve quality gate', () => {
  const projectPath = '/repo/project';
  let gateway: InMemoryReviewRequestTrackingGateway;

  beforeEach(() => {
    gateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('returns 200 when the gate passes (score above threshold, no blockers)', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({ id: 'mr-1', latestScore: 8, openThreads: 0 }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 7 });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(gateway.getById(projectPath, 'mr-1')?.state).toBe('approved');
  });

  it('returns 409 with French message when score is below threshold', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({ id: 'mr-1', latestScore: 6, openThreads: 0 }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 7 });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Seuil qualité non atteint (6/10 < 7/10)');
    expect(gateway.getById(projectPath, 'mr-1')?.state).not.toBe('approved');
  });

  it('returns 409 with French message when blockers are present', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({ id: 'mr-1', latestScore: 9, openThreads: 2 }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 7 });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Issues bloquantes non résolues');
  });

  it('returns 200 when no review has been completed yet (latestScore=null)', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({ id: 'mr-1', latestScore: null, openThreads: 0 }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 7 });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(200);
    expect(gateway.getById(projectPath, 'mr-1')?.state).toBe('approved');
  });

  it('returns 200 when no quality threshold is configured', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({ id: 'mr-1', latestScore: 6, openThreads: 0 }),
    );
    const app = await buildApp({ gateway, qualityThreshold: null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(200);
    expect(gateway.getById(projectPath, 'mr-1')?.state).toBe('approved');
  });

  it('returns 404 when the MR does not exist', async () => {
    const app = await buildApp({ gateway, qualityThreshold: 7 });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'missing', projectPath },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json() as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('returns 400 when projectPath is missing', async () => {
    const app = await buildApp({ gateway, qualityThreshold: null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('mrTrackingRoutes — POST /api/mr-tracking/mark-as-merged', () => {
  const projectPath = '/repo/project';
  let gateway: InMemoryReviewRequestTrackingGateway;

  beforeEach(() => {
    gateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('returns 200 and transitions a pending-fix MR to merged', async () => {
    gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1', state: 'pending-fix' }));
    const app = await buildApp({ gateway, qualityThreshold: null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; mrId: string };
    expect(body.success).toBe(true);
    expect(body.mrId).toBe('mr-1');
    const updated = gateway.getById(projectPath, 'mr-1');
    expect(updated?.state).toBe('merged');
    expect(updated?.mergedAt).not.toBeNull();
  });

  it('returns 409 when the MR is not in pending-fix state', async () => {
    gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1', state: 'approved' }));
    const app = await buildApp({ gateway, qualityThreshold: null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Seules les MR en correction peuvent être marquées comme mergées');
    expect(gateway.getById(projectPath, 'mr-1')?.state).toBe('approved');
  });
});
