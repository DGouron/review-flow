import { describe, it, expect, beforeEach } from 'vitest';

import { ListPendingReviewsUseCase } from '@/modules/review-execution/usecases/listPendingReviews.usecase.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';

describe('ListPendingReviewsUseCase', () => {
  let gateway: StubPendingReviewRequestGateway;

  beforeEach(() => {
    gateway = new StubPendingReviewRequestGateway();
  });

  it('returns an empty list when nothing is pending', async () => {
    const useCase = new ListPendingReviewsUseCase({ pendingReviewRequestGateway: gateway });

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('returns every pending request currently stored', async () => {
    gateway.prepopulate(
      PendingReviewRequestFactory.create({ pendingReviewRequestId: 'pending-1' }),
    );
    gateway.prepopulate(
      PendingReviewRequestFactory.create({ pendingReviewRequestId: 'pending-2' }),
    );
    const useCase = new ListPendingReviewsUseCase({ pendingReviewRequestGateway: gateway });

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.pendingReviewRequestId).toSorted()).toEqual([
      'pending-1',
      'pending-2',
    ]);
  });
});
