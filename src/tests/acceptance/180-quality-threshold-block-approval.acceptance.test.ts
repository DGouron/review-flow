/**
 * SPEC-180 — Block approval below quality threshold (Iteration A)
 *
 * Outer-loop acceptance test (SDD): exercises POST /api/mr-tracking/approve
 * through the Fastify plugin wired with the in-memory tracking gateway and a
 * stubbed quality-threshold provider. Covers the in-scope scenarios for
 * Iteration A — internal quality gate only.
 *
 * In-scope scenarios from docs/specs/180-quality-threshold-block-approval.md:
 *   1: ready review within the grade threshold, no blockers → 200 + approved
 *   2: grade below threshold → 409 + "Niveau qualité non atteint (B, seuil A)"
 *   3: blockers present → 409 + "Issues bloquantes non résolues"
 *   7: no review verdict yet → 409: a missing verdict never approves
 *   8: no threshold configured → 200 + approved
 *
 * Out of scope here (Iteration B / C): comment-based bypass, note webhook
 * parsing, platform unapprove.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import type { QualityGrade } from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import type { RemoveResult } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ReviewEventFactory } from '@/tests/factories/reviewEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

interface BuildAppOptions {
  gateway: InMemoryReviewRequestTrackingGateway;
  qualityThreshold: QualityGrade | null;
}

async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: options.gateway,
    getQualityThreshold: () => options.qualityThreshold,
    reviewContextGateway: new StubReviewContextGateway(),
    cancelJob: () => false,
    buildJobId: (platform: string, path: string, mrNumber: number): string =>
      `${platform}:${path}:${mrNumber}`,
    removeWorktree: async (): Promise<RemoveResult> => ({ status: 'removed' }),
    logger: createCapturingLogger().logger,
  });
  return app;
}

function seedMr(
  gateway: InMemoryReviewRequestTrackingGateway,
  projectPath: string,
  overrides: Partial<TrackedMr>,
): void {
  gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1', ...overrides }));
}

describe('Acceptance — SPEC-180 Iteration A: Block approval below quality threshold', () => {
  let gateway: InMemoryReviewRequestTrackingGateway;
  const projectPath = '/repo/project';

  beforeEach(() => {
    gateway = new InMemoryReviewRequestTrackingGateway();
  });

  describe('Rule: approval gated by verdict, grade and blockers', () => {
    it('scenario 1 — ready review within the threshold, no open threads → 200 + approved', async () => {
      seedMr(gateway, projectPath, {
        state: 'pending-approval',
        reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'B' })],
        totalBlocking: 0,
        openThreads: 0,
      });
      const app = await buildApp({ gateway, qualityThreshold: 'B' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/approve',
        payload: { mrId: 'mr-1', projectPath },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean };
      expect(body.success).toBe(true);
      const updated = gateway.getById(projectPath, 'mr-1');
      expect(updated?.state).toBe('approved');
      expect(updated?.approvedAt).not.toBeNull();
    });

    it('scenario 2 — grade below threshold blocks transition with French message', async () => {
      seedMr(gateway, projectPath, {
        state: 'pending-approval',
        reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'B' })],
        totalBlocking: 0,
        openThreads: 0,
      });
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
      const updated = gateway.getById(projectPath, 'mr-1');
      expect(updated?.state).toBe('pending-approval');
      expect(updated?.approvedAt).toBeNull();
    });

    it('scenario 3 — open blockers block transition with French message', async () => {
      seedMr(gateway, projectPath, {
        state: 'pending-approval',
        reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'A' })],
        totalBlocking: 0,
        openThreads: 2,
      });
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
      const updated = gateway.getById(projectPath, 'mr-1');
      expect(updated?.state).toBe('pending-approval');
      expect(updated?.approvedAt).toBeNull();
    });
  });

  describe('Rule: a missing verdict blocks, a missing threshold does not', () => {
    it('scenario 7 — no review verdict yet blocks approval', async () => {
      seedMr(gateway, projectPath, {
        state: 'pending-approval',
        reviews: [],
        totalBlocking: 0,
        openThreads: 0,
      });
      const app = await buildApp({ gateway, qualityThreshold: 'B' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/approve',
        payload: { mrId: 'mr-1', projectPath },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { success: boolean; error: string };
      expect(body.error).toBe('Aucun verdict de review : approbation impossible');
      const updated = gateway.getById(projectPath, 'mr-1');
      expect(updated?.state).toBe('pending-approval');
    });

    it('scenario 8 — no threshold configured allows approval despite a review to rework', async () => {
      seedMr(gateway, projectPath, {
        state: 'pending-approval',
        reviews: [ReviewEventFactory.create({ verdict: 'changes', grade: 'C' })],
        totalBlocking: 0,
        openThreads: 0,
      });
      const app = await buildApp({ gateway, qualityThreshold: null });

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/approve',
        payload: { mrId: 'mr-1', projectPath },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean };
      expect(body.success).toBe(true);
      const updated = gateway.getById(projectPath, 'mr-1');
      expect(updated?.state).toBe('approved');
    });
  });
});
