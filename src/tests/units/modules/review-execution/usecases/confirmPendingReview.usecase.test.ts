import { describe, it, expect, beforeEach } from 'vitest';
import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import { ConfirmPendingReviewUseCase } from '@/modules/review-execution/usecases/confirmPendingReview.usecase.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

describe('ConfirmPendingReviewUseCase', () => {
  let gateway: StubPendingReviewRequestGateway;
  let activeJobs: Set<string>;
  let enqueueCalls: ReviewJob[];
  let processorRuns: number;
  const logger = createStubLogger();

  beforeEach(() => {
    gateway = new StubPendingReviewRequestGateway();
    activeJobs = new Set();
    enqueueCalls = [];
    processorRuns = 0;
  });

  const enqueueSuccess = async (
    job: ReviewJob,
    processor: (job: ReviewJob, signal: AbortSignal) => Promise<void>,
  ): Promise<boolean> => {
    enqueueCalls.push(job);
    activeJobs.add(job.id);
    await processor(job, new AbortController().signal);
    return true;
  };

  const fakeProcessor = async (): Promise<void> => {
    processorRuns += 1;
  };

  function makeUseCase(): ConfirmPendingReviewUseCase {
    return new ConfirmPendingReviewUseCase({
      pendingReviewRequestGateway: gateway,
      queuePort: {
        hasActiveJob: (id) => activeJobs.has(id),
        getJobStatus: () => null,
      },
      enqueue: enqueueSuccess,
      resolveProcessor: () => fakeProcessor,
      isProjectRunnable: () => true,
      logger,
    });
  }

  describe('Rule: confirming a pending job enqueues it and invokes Claude', () => {
    it('returns confirmed and deletes the pending entry', async () => {
      const pending = PendingReviewRequestFactory.create();
      gateway.prepopulate(pending);

      const result = await makeUseCase().execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('confirmed');
      expect(enqueueCalls).toHaveLength(1);
      expect(processorRuns).toBe(1);
      expect(gateway.deleteCount).toBe(1);
      expect(await gateway.listAll()).toHaveLength(0);
    });
  });

  describe('Rule: confirming a missing job returns not-found', () => {
    it('returns not-found when the pending id is unknown', async () => {
      const result = await makeUseCase().execute({ pendingId: 'unknown-id' });

      expect(result.status).toBe('not-found');
    });
  });

  describe('Rule: confirming an already-running review is rejected with a French message', () => {
    it('returns already-running and the exact French message from the spec', async () => {
      const pending = PendingReviewRequestFactory.create();
      gateway.prepopulate(pending);
      activeJobs.add(pending.job.id);

      const result = await makeUseCase().execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('already-running');
      if (result.status === 'already-running') {
        expect(result.message).toBe('Cette review est déjà en cours');
      }
      expect(enqueueCalls).toHaveLength(0);
    });
  });

  describe('Rule: confirming a request that the queue refuses returns already-running', () => {
    it('reports already-running when enqueue refuses (race against running job)', async () => {
      const pending = PendingReviewRequestFactory.create();
      gateway.prepopulate(pending);
      const useCase = new ConfirmPendingReviewUseCase({
        pendingReviewRequestGateway: gateway,
        queuePort: { hasActiveJob: () => false, getJobStatus: () => null },
        enqueue: async () => false,
        resolveProcessor: () => fakeProcessor,
        isProjectRunnable: () => true,
        logger,
      });

      const result = await useCase.execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('already-running');
    });
  });

  describe('Rule: confirming a request whose project is no longer configured is rejected', () => {
    it('returns project-not-configured with the exact French message and keeps the pending entry', async () => {
      const pending = PendingReviewRequestFactory.create();
      gateway.prepopulate(pending);
      const useCase = new ConfirmPendingReviewUseCase({
        pendingReviewRequestGateway: gateway,
        queuePort: { hasActiveJob: (id) => activeJobs.has(id), getJobStatus: () => null },
        enqueue: enqueueSuccess,
        resolveProcessor: () => fakeProcessor,
        isProjectRunnable: () => false,
        logger,
      });

      const result = await useCase.execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('project-not-configured');
      if (result.status === 'project-not-configured') {
        expect(result.message).toBe("Le projet associé n'est plus configuré");
      }
      expect(enqueueCalls).toHaveLength(0);
      expect(processorRuns).toBe(0);
      expect(gateway.deleteCount).toBe(0);
      expect(await gateway.listAll()).toHaveLength(1);
    });
  });
});
