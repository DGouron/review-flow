import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import { pendingReviewsRoutes } from '@/modules/review-execution/interface-adapters/controllers/http/pendingReviews.routes.js';
import { ListPendingReviewsUseCase } from '@/modules/review-execution/usecases/listPendingReviews.usecase.js';
import { ConfirmPendingReviewUseCase } from '@/modules/review-execution/usecases/confirmPendingReview.usecase.js';
import { DismissPendingReviewUseCase } from '@/modules/review-execution/usecases/dismissPendingReview.usecase.js';
import { PendingReviewPresenter } from '@/modules/review-execution/interface-adapters/presenters/pendingReview.presenter.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

async function buildApp(
  gateway: StubPendingReviewRequestGateway,
  activeJobs: Set<string>,
  isProjectRunnable: () => boolean = () => true,
): Promise<FastifyInstance> {
  const app = Fastify();
  const logger = createStubLogger();
  await app.register(pendingReviewsRoutes, {
    listPendingReviews: new ListPendingReviewsUseCase({ pendingReviewRequestGateway: gateway }),
    confirmPendingReview: new ConfirmPendingReviewUseCase({
      pendingReviewRequestGateway: gateway,
      queuePort: { hasActiveJob: (id) => activeJobs.has(id), getJobStatus: () => null },
      enqueue: async (job: ReviewJob) => {
        activeJobs.add(job.id);
        return true;
      },
      resolveProcessor: () => async () => {},
      isProjectRunnable,
      logger,
    }),
    dismissPendingReview: new DismissPendingReviewUseCase({
      pendingReviewRequestGateway: gateway,
      queuePort: { hasActiveJob: (id) => activeJobs.has(id) },
      logger,
    }),
    presenter: new PendingReviewPresenter(),
  });
  await app.ready();
  return app;
}

describe('pendingReviewsRoutes', () => {
  let app: FastifyInstance;
  let gateway: StubPendingReviewRequestGateway;
  let activeJobs: Set<string>;

  beforeEach(async () => {
    gateway = new StubPendingReviewRequestGateway();
    activeJobs = new Set();
    app = await buildApp(gateway, activeJobs);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/pending-reviews returns view models for every pending entry', async () => {
    gateway.prepopulate(PendingReviewRequestFactory.create({ pendingReviewRequestId: 'p1' }));
    gateway.prepopulate(PendingReviewRequestFactory.create({ pendingReviewRequestId: 'p2' }));

    const response = await app.inject({ method: 'GET', url: '/api/pending-reviews' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { pendingReviews: Array<{ identifier: string }> };
    expect(body.pendingReviews).toHaveLength(2);
    expect(body.pendingReviews.map((entry) => entry.identifier).sort()).toEqual(['p1', 'p2']);
  });

  it('POST /api/pending-reviews/:id/confirm returns confirmed status', async () => {
    const pending = PendingReviewRequestFactory.create();
    gateway.prepopulate(pending);

    const response = await app.inject({
      method: 'POST',
      url: `/api/pending-reviews/${pending.pendingReviewRequestId}/confirm`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'confirmed', jobId: pending.job.id });
  });

  it('POST .../confirm returns 404 when id is unknown', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pending-reviews/unknown/confirm',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      status: 'not-found',
      message: 'Cette review en attente est introuvable',
    });
  });

  it('POST .../confirm returns 409 with French message when already running', async () => {
    const pending = PendingReviewRequestFactory.create();
    gateway.prepopulate(pending);
    activeJobs.add(pending.job.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/pending-reviews/${pending.pendingReviewRequestId}/confirm`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: 'already-running',
      message: 'Cette review est déjà en cours',
    });
  });

  it('POST .../confirm returns 422 with French message when the project is no longer configured', async () => {
    const pending = PendingReviewRequestFactory.create();
    gateway.prepopulate(pending);
    await app.close();
    app = await buildApp(gateway, activeJobs, () => false);

    const response = await app.inject({
      method: 'POST',
      url: `/api/pending-reviews/${pending.pendingReviewRequestId}/confirm`,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      status: 'project-not-configured',
      message: "Le projet associé n'est plus configuré",
    });
  });

  it('DELETE /api/pending-reviews/:id returns dismissed status', async () => {
    const pending = PendingReviewRequestFactory.create();
    gateway.prepopulate(pending);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/pending-reviews/${pending.pendingReviewRequestId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'dismissed' });
  });

  it('DELETE returns 409 with French message when already running', async () => {
    const pending = PendingReviewRequestFactory.create();
    gateway.prepopulate(pending);
    activeJobs.add(pending.job.id);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/pending-reviews/${pending.pendingReviewRequestId}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: 'already-running',
      message: "Cette review est déjà en cours, impossible de l'ignorer",
    });
  });
});
