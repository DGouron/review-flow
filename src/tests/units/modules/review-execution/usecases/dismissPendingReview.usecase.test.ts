import { describe, it, expect, beforeEach } from 'vitest';

import { DismissPendingReviewUseCase } from '@/modules/review-execution/usecases/dismissPendingReview.usecase.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';

describe('DismissPendingReviewUseCase', () => {
  let gateway: StubPendingReviewRequestGateway;
  let activeJobs: Set<string>;
  const logger = createStubLogger();

  beforeEach(() => {
    gateway = new StubPendingReviewRequestGateway();
    activeJobs = new Set();
  });

  function makeUseCase(): DismissPendingReviewUseCase {
    return new DismissPendingReviewUseCase({
      pendingReviewRequestGateway: gateway,
      queuePort: { hasActiveJob: (id) => activeJobs.has(id) },
      logger,
    });
  }

  describe('Rule: dismissing a pending job removes it', () => {
    it('returns dismissed and deletes the pending entry', async () => {
      const pending = PendingReviewRequestFactory.create();
      gateway.prepopulate(pending);

      const result = await makeUseCase().execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('dismissed');
      expect(gateway.deleteCount).toBe(1);
      expect(await gateway.listAll()).toHaveLength(0);
    });
  });

  describe('Rule: dismissing an unknown id returns not-found', () => {
    it('returns not-found when the pending id is unknown', async () => {
      const result = await makeUseCase().execute({ pendingId: 'unknown-id' });

      expect(result.status).toBe('not-found');
    });
  });

  describe('Rule: dismissing a job already running is rejected with the French message', () => {
    it('returns already-running and the exact French message from the spec', async () => {
      const pending = PendingReviewRequestFactory.create();
      gateway.prepopulate(pending);
      activeJobs.add(pending.job.id);

      const result = await makeUseCase().execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('already-running');
      if (result.status === 'already-running') {
        expect(result.message).toBe("Cette review est déjà en cours, impossible de l'ignorer");
      }
    });
  });
});
