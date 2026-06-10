import type { FastifyPluginAsync } from 'fastify';

import type { PendingReviewPresenter } from '@/modules/review-execution/interface-adapters/presenters/pendingReview.presenter.js';
import type { ConfirmPendingReviewUseCase } from '@/modules/review-execution/usecases/confirmPendingReview.usecase.js';
import type { DismissPendingReviewUseCase } from '@/modules/review-execution/usecases/dismissPendingReview.usecase.js';
import type { ListPendingReviewsUseCase } from '@/modules/review-execution/usecases/listPendingReviews.usecase.js';

export interface PendingReviewsRoutesOptions {
  listPendingReviews: ListPendingReviewsUseCase;
  confirmPendingReview: ConfirmPendingReviewUseCase;
  dismissPendingReview: DismissPendingReviewUseCase;
  presenter: PendingReviewPresenter;
}

interface PendingIdParams {
  pendingId: string;
}

export const pendingReviewsRoutes: FastifyPluginAsync<PendingReviewsRoutesOptions> = async (
  fastify,
  opts,
) => {
  const { listPendingReviews, confirmPendingReview, dismissPendingReview, presenter } = opts;

  fastify.get('/api/pending-reviews', async () => {
    const pendingList = await listPendingReviews.execute();
    return { pendingReviews: pendingList.map((entry) => presenter.present(entry)) };
  });

  fastify.post<{ Params: PendingIdParams }>(
    '/api/pending-reviews/:pendingId/confirm',
    async (request, reply) => {
      const { pendingId } = request.params;
      const result = await confirmPendingReview.execute({ pendingId });
      if (result.status === 'not-found') {
        reply.code(404);
        return { status: 'not-found', message: 'Cette review en attente est introuvable' };
      }
      if (result.status === 'already-running') {
        reply.code(409);
        return { status: 'already-running', message: result.message };
      }
      if (result.status === 'project-not-configured') {
        reply.code(422);
        return { status: 'project-not-configured', message: result.message };
      }
      return { status: 'confirmed', jobId: result.jobId };
    },
  );

  fastify.delete<{ Params: PendingIdParams }>(
    '/api/pending-reviews/:pendingId',
    async (request, reply) => {
      const { pendingId } = request.params;
      const result = await dismissPendingReview.execute({ pendingId });
      if (result.status === 'not-found') {
        reply.code(404);
        return { status: 'not-found' };
      }
      if (result.status === 'already-running') {
        reply.code(409);
        return { status: 'already-running', message: result.message };
      }
      return { status: 'dismissed' };
    },
  );
};
