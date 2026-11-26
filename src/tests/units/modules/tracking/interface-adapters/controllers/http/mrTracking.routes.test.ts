import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import type { QualityGrade } from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import type { ReviewEvent } from '@/modules/tracking/entities/tracking/reviewEvent.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { ReviewEventFactory } from '@/tests/factories/reviewEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

interface BuildAppOptions {
  gateway: InMemoryReviewRequestTrackingGateway;
  qualityThreshold: QualityGrade | null;
  statsGateway?: InMemoryStatsGateway;
}

async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: options.gateway,
    getQualityThreshold: () => options.qualityThreshold,
    statsGateway: options.statsGateway,
    reviewContextGateway: new StubReviewContextGateway(),
    cancelJob: () => false,
    buildJobId: (platform: string, path: string, mrNumber: number): string =>
      `${platform}:${path}:${mrNumber}`,
    removeWorktree: async (): Promise<RemoveResult> => ({ status: 'removed' }),
    logger: createCapturingLogger().logger,
  });
  return app;
}

function reviewEvent(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    type: 'review',
    timestamp: '2024-01-15T10:00:00Z',
    durationMs: 60000,
    score: 8,
    blocking: 0,
    warnings: 0,
    suggestions: 0,
    threadsClosed: 0,
    threadsOpened: 0,
    diffStats: null,
    ...overrides,
  };
}

describe('mrTrackingRoutes — POST /api/mr-tracking/approve quality gate', () => {
  const projectPath = '/repo/project';
  let gateway: InMemoryReviewRequestTrackingGateway;

  beforeEach(() => {
    gateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('returns 200 when the gate passes (ready review within the threshold, no blockers)', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({
        id: 'mr-1',
        reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'B' })],
        openThreads: 0,
      }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 'B' });

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

  it('returns 409 with French message when the grade is below threshold', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({
        id: 'mr-1',
        reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'B' })],
        openThreads: 0,
      }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 'A' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Niveau qualité non atteint (B, seuil A)');
    expect(gateway.getById(projectPath, 'mr-1')?.state).not.toBe('approved');
  });

  it('returns 409 with French message when blockers are present', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({
        id: 'mr-1',
        reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'A' })],
        openThreads: 2,
      }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 'B' });

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

  it('returns 409 when no review verdict exists yet', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({ id: 'mr-1', reviews: [], openThreads: 0 }),
    );
    const app = await buildApp({ gateway, qualityThreshold: 'B' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/approve',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(409);
    expect(gateway.getById(projectPath, 'mr-1')?.state).not.toBe('approved');
  });

  it('returns 200 when no quality threshold is configured', async () => {
    gateway.create(
      projectPath,
      TrackedMrFactory.create({
        id: 'mr-1',
        reviews: [ReviewEventFactory.create({ verdict: 'changes', grade: 'C' })],
        openThreads: 0,
      }),
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
    const app = await buildApp({ gateway, qualityThreshold: 'B' });

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

  it('returns 200 and transitions an approved MR to merged (SPEC-215: any state)', async () => {
    gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1', state: 'approved' }));
    const app = await buildApp({ gateway, qualityThreshold: null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/mark-as-merged',
      payload: { mrId: 'mr-1', projectPath },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(gateway.getById(projectPath, 'mr-1')?.state).toBe('merged');
  });
});

describe('mrTrackingRoutes — GET /api/mr-tracking diff stats enrichment', () => {
  const projectPath = '/repo/project';

  it('enriches pending MRs with diff stats from project stats by MR number', async () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      projectPath,
      TrackedMrFactory.create({
        id: 'mr-1',
        mrNumber: 5438,
        state: 'pending-fix',
        reviews: [reviewEvent()],
      }),
    );
    const statsGateway = new InMemoryStatsGateway();
    statsGateway.saveProjectStats(
      projectPath,
      ProjectStatsFactory.withReviews([
        ReviewStatsFactory.create({
          mrNumber: 5438,
          diffStats: { commitsCount: 3, additions: 120, deletions: 40 },
        }),
      ]),
    );
    const app = await buildApp({ gateway, qualityThreshold: null, statsGateway });

    const response = await app.inject({
      method: 'GET',
      url: `/api/mr-tracking?path=${encodeURIComponent(projectPath)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      pendingFix: Array<{ reviews: ReviewEvent[] }>;
    };
    expect(body.pendingFix[0].reviews.at(-1)?.diffStats).toEqual({
      commitsCount: 3,
      additions: 120,
      deletions: 40,
    });
  });

  it('returns MRs without diff stats when no stats gateway is wired', async () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      projectPath,
      TrackedMrFactory.create({
        id: 'mr-1',
        mrNumber: 5438,
        state: 'pending-fix',
        reviews: [reviewEvent()],
      }),
    );
    const app = await buildApp({ gateway, qualityThreshold: null });

    const response = await app.inject({
      method: 'GET',
      url: `/api/mr-tracking?path=${encodeURIComponent(projectPath)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      pendingFix: Array<{ reviews: ReviewEvent[] }>;
    };
    expect(body.pendingFix[0].reviews.at(-1)?.diffStats).toBeNull();
  });
});

describe('mrTrackingRoutes — GET /api/mr-tracking sync summary', () => {
  it('reports no sync summary when no platform sync is wired', async () => {
    const app = await buildApp({
      gateway: new InMemoryReviewRequestTrackingGateway(),
      qualityThreshold: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/mr-tracking?path=${encodeURIComponent('/repo/project')}`,
    });

    expect(response.json()).toMatchObject({ success: true, sync: null });
  });
});
