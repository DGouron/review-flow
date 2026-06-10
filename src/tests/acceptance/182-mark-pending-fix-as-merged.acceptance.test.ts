/**
 * SPEC-182 — Manually mark a pending-fix MR as merged
 *
 * Outer-loop acceptance test (SDD): exercises POST /api/mr-tracking/mark-as-merged
 * through the Fastify plugin wired with the in-memory tracking gateway. Covers
 * the 8 scenarios from the spec.
 *
 * Scenarios from docs/specs/182-mark-pending-fix-as-merged.md:
 *   - valid pending-fix → merged: 200 + state="merged" + mergedAt set
 *   - pending-approval rejected: 409 + invalid-current-state message
 *   - approved rejected: 409 + invalid-current-state message
 *   - merged rejected: 409 + invalid-current-state message
 *   - unknown MR: 404 + "MR non trouvée"
 *   - missing mrId: 400 + "mrId requis"
 *   - missing project path: 400 + "Chemin du projet requis"
 *   - invalid project path: 400 + "Chemin invalide"
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const INVALID_CURRENT_STATE_MESSAGE =
  'Seules les MR en correction peuvent être marquées comme mergées';

async function buildApp(gateway: InMemoryReviewRequestTrackingGateway): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: gateway,
    getQualityThreshold: () => null,
  });
  return app;
}

function seedMr(
  gateway: InMemoryReviewRequestTrackingGateway,
  projectPath: string,
  overrides: Partial<TrackedMr>,
): void {
  gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-42', ...overrides }));
}

describe('Acceptance — SPEC-182: Manually mark a pending-fix MR as merged', () => {
  let gateway: InMemoryReviewRequestTrackingGateway;
  const projectPath = '/home/user/proj';

  beforeEach(() => {
    gateway = new InMemoryReviewRequestTrackingGateway();
  });

  describe('Rule: pending-fix MR can be transitioned to merged', () => {
    it('valid pending-fix transition → status "merged" + mergedAt set', async () => {
      seedMr(gateway, projectPath, { state: 'pending-fix' });
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'mr-42', projectPath },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean; mrId: string };
      expect(body.success).toBe(true);
      expect(body.mrId).toBe('mr-42');
      const updated = gateway.getById(projectPath, 'mr-42');
      expect(updated?.state).toBe('merged');
      expect(updated?.mergedAt).not.toBeNull();
    });
  });

  describe('Rule: transition restricted to pending-fix state', () => {
    it('pending-approval rejected → 409 with invalid-current-state message', async () => {
      seedMr(gateway, projectPath, { state: 'pending-approval' });
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'mr-42', projectPath },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe(INVALID_CURRENT_STATE_MESSAGE);
      const untouched = gateway.getById(projectPath, 'mr-42');
      expect(untouched?.state).toBe('pending-approval');
      expect(untouched?.mergedAt).toBeNull();
    });

    it('approved rejected → 409 with invalid-current-state message', async () => {
      seedMr(gateway, projectPath, { state: 'approved' });
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'mr-42', projectPath },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe(INVALID_CURRENT_STATE_MESSAGE);
      const untouched = gateway.getById(projectPath, 'mr-42');
      expect(untouched?.state).toBe('approved');
      expect(untouched?.mergedAt).toBeNull();
    });

    it('merged rejected → 409 with invalid-current-state message', async () => {
      seedMr(gateway, projectPath, { state: 'merged', mergedAt: '2026-01-01T00:00:00.000Z' });
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'mr-42', projectPath },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe(INVALID_CURRENT_STATE_MESSAGE);
    });
  });

  describe('Rule: action requires a known MR and valid inputs', () => {
    it('unknown MR → 404 with "MR non trouvée"', async () => {
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'ghost', projectPath },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('MR non trouvée');
    });

    it('missing mrId → 400 with "mrId requis"', async () => {
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: '', projectPath },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('mrId requis');
    });

    it('missing project path → 400 with "Chemin du projet requis"', async () => {
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'mr-42', projectPath: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('Chemin du projet requis');
    });

    it('invalid project path → 400 with "Chemin invalide"', async () => {
      const app = await buildApp(gateway);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/mark-as-merged',
        payload: { mrId: 'mr-42', projectPath: '../etc' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('Chemin invalide');
    });
  });
});
