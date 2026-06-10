import { describe, it, expect, beforeEach } from 'vitest';

import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';

function buildReviewJob(overrides: Partial<ReviewJob> = {}): ReviewJob {
  return {
    id: 'gitlab:group/project:42',
    platform: 'gitlab',
    projectPath: 'group/project',
    localPath: '/home/user/projects/test',
    mrNumber: 42,
    skill: 'review-code',
    mrUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    sourceBranch: 'feature/x',
    targetBranch: 'main',
    jobType: 'review',
    ...overrides,
  };
}

describe('GateClaudeInvocationUseCase', () => {
  let gateway: StubPendingReviewRequestGateway;
  let enqueueCalls: ReviewJob[];
  let processorRuns: number;
  let broadcasts: number;
  const logger = createStubLogger();

  beforeEach(() => {
    gateway = new StubPendingReviewRequestGateway();
    enqueueCalls = [];
    processorRuns = 0;
    broadcasts = 0;
  });

  const enqueueSuccess = async (
    job: ReviewJob,
    processor: (job: ReviewJob, signal: AbortSignal) => Promise<void>,
  ): Promise<boolean> => {
    enqueueCalls.push(job);
    await processor(job, new AbortController().signal);
    return true;
  };

  const processor = async (): Promise<void> => {
    processorRuns += 1;
  };

  describe('Rule: full-auto delegates directly to enqueue', () => {
    it('returns enqueued status and invokes the processor', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'full-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {},
        logger,
      });

      const result = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
      });

      expect(result.status).toBe('enqueued');
      expect(enqueueCalls).toHaveLength(1);
      expect(processorRuns).toBe(1);
    });

    it('returns rejected status when enqueue refuses the job', async () => {
      const enqueueRejects = async (): Promise<boolean> => false;
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'full-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueRejects,
        broadcastPendingChanged: () => {},
        logger,
      });

      const result = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
      });

      expect(result.status).toBe('rejected');
    });
  });

  describe('Rule: semi-auto persists a pending request and skips enqueue', () => {
    it('saves the pending request and never calls enqueue', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'semi-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {
          broadcasts += 1;
        },
        logger,
      });

      const result = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
      });

      expect(result.status).toBe('pending');
      expect(enqueueCalls).toHaveLength(0);
      expect(processorRuns).toBe(0);
      expect(gateway.saveCount).toBe(1);
      expect(broadcasts).toBe(1);
    });

    it('persists followup job type when triggered from webhook-followup source', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'semi-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {},
        logger,
      });

      await useCase.execute({
        job: buildReviewJob({ jobType: 'followup' }),
        triggerSource: 'webhook-followup',
        processor,
      });

      const allPending = await gateway.listAll();
      expect(allPending).toHaveLength(1);
      expect(allPending[0].jobType).toBe('followup');
      expect(allPending[0].triggerSource).toBe('webhook-followup');
    });

    it('full-auto followup is unchanged: delegates to enqueue and invokes Claude', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'full-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {},
        logger,
      });

      const result = await useCase.execute({
        job: buildReviewJob({ jobType: 'followup' }),
        triggerSource: 'webhook-followup',
        processor,
      });

      expect(result.status).toBe('enqueued');
      expect(processorRuns).toBe(1);
      expect(gateway.saveCount).toBe(0);
    });
  });

  describe('Rule: trigger mode is read live on every gate (runtime-mutable)', () => {
    it('reflects a trigger-mode change between two executions without reconstruction', async () => {
      let mode: 'full-auto' | 'semi-auto' = 'semi-auto';
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => mode,
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {},
        logger,
      });

      const first = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
      });
      expect(first.status).toBe('pending');
      expect(enqueueCalls).toHaveLength(0);

      mode = 'full-auto';

      const second = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
      });
      expect(second.status).toBe('enqueued');
      expect(enqueueCalls).toHaveLength(1);
    });
  });

  describe('Rule: a non-trusted actor parks pending even in full-auto (SPEC-197)', () => {
    it('parks the job and never enqueues when actorTrusted is false', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'full-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {
          broadcasts += 1;
        },
        logger,
      });

      const result = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
        actorTrusted: false,
      });

      expect(result.status).toBe('pending');
      expect(enqueueCalls).toHaveLength(0);
      expect(processorRuns).toBe(0);
      expect(gateway.saveCount).toBe(1);
      expect(broadcasts).toBe(1);
    });

    it('enqueues normally in full-auto when actorTrusted is true', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'full-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: enqueueSuccess,
        broadcastPendingChanged: () => {},
        logger,
      });

      const result = await useCase.execute({
        job: buildReviewJob(),
        triggerSource: 'webhook-initial',
        processor,
        actorTrusted: true,
      });

      expect(result.status).toBe('enqueued');
      expect(processorRuns).toBe(1);
      expect(gateway.saveCount).toBe(0);
    });
  });
});
