import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
}));

import Fastify, { type FastifyInstance } from 'fastify';

import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import { createTrackedMrId } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { sizeBlocksRoutes } from '@/modules/tracking/interface-adapters/controllers/http/sizeBlocks.routes.js';
import { SizeBlockListPresenter } from '@/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.js';
import { ForceLaunchBlockedReviewUseCase } from '@/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.js';
import { MrTrackingDataFactory, TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const REPO: RepositoryConfig = {
  name: 'Project A',
  platform: 'gitlab',
  remoteUrl: 'https://gitlab.com/group/a.git',
  localPath: '/repo/a',
  skill: 'review',
  enabled: true,
};

const MR_ID = createTrackedMrId('gitlab', 'group/a', 1);

function seedBlocked(tracking: InMemoryReviewRequestTrackingGateway): void {
  tracking.saveTracking(
    '/repo/a',
    MrTrackingDataFactory.withMrs([
      TrackedMrFactory.create({
        id: MR_ID,
        mrNumber: 1,
        title: 'MR A',
        project: 'group/a',
        sizeBlock: { countedLines: 2500, budget: 2000, message: 'trop gros', blockedAt: 'now' },
      }),
    ]),
  );
}

async function buildApp(
  tracking: InMemoryReviewRequestTrackingGateway,
  enqueue: () => Promise<boolean> = async () => true,
): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sizeBlocksRoutes, {
    getRepositories: () => [REPO],
    reviewRequestTrackingGateway: tracking,
    sizeBlockListPresenter: new SizeBlockListPresenter(),
    forceLaunchBlockedReview: new ForceLaunchBlockedReviewUseCase({
      reviewRequestTrackingGateway: tracking,
      enqueue,
      logger: createStubLogger(),
    }),
    resolveReviewProcessor: () => async () => undefined,
    logger: createStubLogger(),
  });
  return app;
}

describe('sizeBlocksRoutes', () => {
  describe('GET /api/size-blocks', () => {
    it('returns the blocked MRs across enabled projects', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      seedBlocked(tracking);
      const app = await buildApp(tracking);

      const response = await app.inject({ method: 'GET', url: '/api/size-blocks' });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.isEmpty).toBe(false);
      expect(payload.blocks).toHaveLength(1);
      expect(payload.blocks[0].projectName).toBe('Project A');
      expect(payload.blocks[0].countedLines).toBe(2500);
    });

    it('returns an empty payload when nothing is blocked', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      tracking.saveTracking('/repo/a', MrTrackingDataFactory.withMrs([TrackedMrFactory.create()]));
      const app = await buildApp(tracking);

      const response = await app.inject({ method: 'GET', url: '/api/size-blocks' });

      expect(response.json().isEmpty).toBe(true);
    });
  });

  describe('POST /api/mr-tracking/force-start', () => {
    it('clears the size block and returns success when the review is enqueued', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      seedBlocked(tracking);
      const app = await buildApp(tracking, async () => true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/force-start',
        payload: { mrId: MR_ID, projectPath: '/repo/a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(tracking.getById('/repo/a', MR_ID)?.sizeBlock).toBeNull();
    });

    it('rejects a duplicate with a 409 and keeps the size block', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      seedBlocked(tracking);
      const app = await buildApp(tracking, async () => false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/force-start',
        payload: { mrId: MR_ID, projectPath: '/repo/a' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().success).toBe(false);
      expect(tracking.getById('/repo/a', MR_ID)?.sizeBlock).not.toBeNull();
    });

    it('returns 400 for an invalid mrId format', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      const app = await buildApp(tracking);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/force-start',
        payload: { mrId: 'not-valid', projectPath: '/repo/a' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when the MR is not tracked', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      tracking.saveTracking('/repo/a', MrTrackingDataFactory.withMrs([]));
      const app = await buildApp(tracking);

      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/force-start',
        payload: { mrId: MR_ID, projectPath: '/repo/a' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
