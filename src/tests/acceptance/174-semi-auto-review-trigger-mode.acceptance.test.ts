import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import { PendingReviewRequestFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/pendingReviewRequest.fileSystem.gateway.js';
import { ConfirmPendingReviewUseCase } from '@/modules/review-execution/usecases/confirmPendingReview.usecase.js';
import { DismissPendingReviewUseCase } from '@/modules/review-execution/usecases/dismissPendingReview.usecase.js';
import { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import { ListPendingReviewsUseCase } from '@/modules/review-execution/usecases/listPendingReviews.usecase.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

function createReviewJob(overrides: Partial<ReviewJob> = {}): ReviewJob {
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

describe('Acceptance — SPEC-174: Semi-automatic review trigger mode', () => {
  let pendingDir: string;
  let gateway: PendingReviewRequestFileSystemGateway;
  let claudeInvocations: number;
  let enqueuedJobs: ReviewJob[];
  let activeJobIds: Set<string>;
  const logger = createStubLogger();

  beforeEach(() => {
    pendingDir = mkdtempSync(join(tmpdir(), 'reviewflow-pending-acceptance-'));
    gateway = new PendingReviewRequestFileSystemGateway({ rootDir: pendingDir });
    claudeInvocations = 0;
    enqueuedJobs = [];
    activeJobIds = new Set();
  });

  afterEach(() => {
    rmSync(pendingDir, { recursive: true, force: true });
  });

  const fakeEnqueue = async (
    job: ReviewJob,
    processor: (job: ReviewJob, signal: AbortSignal) => Promise<void>,
  ): Promise<boolean> => {
    enqueuedJobs.push(job);
    activeJobIds.add(job.id);
    await processor(job, new AbortController().signal);
    return true;
  };

  const fakeProcessor = async (): Promise<void> => {
    claudeInvocations += 1;
  };

  describe('Rule: semi-auto initial review parks the job instead of invoking Claude', () => {
    it('produces a persisted pending review and never invokes Claude', async () => {
      const useCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'semi-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: fakeEnqueue,
        broadcastPendingChanged: () => {},
        logger,
      });

      const result = await useCase.execute({
        job: createReviewJob(),
        triggerSource: 'webhook-initial',
        processor: fakeProcessor,
      });

      expect(result.status).toBe('pending');
      expect(claudeInvocations).toBe(0);
      expect(enqueuedJobs).toHaveLength(0);

      const persistedFiles = readdirSync(pendingDir);
      expect(persistedFiles).toHaveLength(1);

      const listUseCase = new ListPendingReviewsUseCase({ pendingReviewRequestGateway: gateway });
      const pending = await listUseCase.execute();
      expect(pending).toHaveLength(1);
      expect(pending[0].job.id).toBe('gitlab:group/project:42');
      expect(pending[0].jobType).toBe('review');
    });
  });

  describe('Rule: confirming a pending job invokes Claude exactly once', () => {
    it('confirms then enqueues + invokes Claude + deletes the pending file', async () => {
      const gateUseCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'semi-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: fakeEnqueue,
        broadcastPendingChanged: () => {},
        logger,
      });
      const gateResult = await gateUseCase.execute({
        job: createReviewJob(),
        triggerSource: 'webhook-initial',
        processor: fakeProcessor,
      });
      if (gateResult.status !== 'pending') throw new Error('expected pending status');
      const pendingId = gateResult.pendingId;

      const confirmUseCase = new ConfirmPendingReviewUseCase({
        pendingReviewRequestGateway: gateway,
        queuePort: { hasActiveJob: (id) => activeJobIds.has(id), getJobStatus: () => null },
        enqueue: fakeEnqueue,
        resolveProcessor: () => fakeProcessor,
        isProjectRunnable: () => true,
        logger,
      });
      const confirmResult = await confirmUseCase.execute({ pendingId });

      expect(confirmResult.status).toBe('confirmed');
      expect(claudeInvocations).toBe(1);
      expect(enqueuedJobs).toHaveLength(1);

      const listUseCase = new ListPendingReviewsUseCase({ pendingReviewRequestGateway: gateway });
      const stillPending = await listUseCase.execute();
      expect(stillPending).toHaveLength(0);
    });
  });

  describe('Rule: dismissing a pending job removes it without invoking Claude', () => {
    it('dismisses then deletes the pending file and never invokes Claude', async () => {
      const gateUseCase = new GateClaudeInvocationUseCase({
        getTriggerMode: () => 'semi-auto',
        pendingReviewRequestGateway: gateway,
        enqueue: fakeEnqueue,
        broadcastPendingChanged: () => {},
        logger,
      });
      const gateResult = await gateUseCase.execute({
        job: createReviewJob(),
        triggerSource: 'webhook-initial',
        processor: fakeProcessor,
      });
      if (gateResult.status !== 'pending') throw new Error('expected pending status');

      const dismissUseCase = new DismissPendingReviewUseCase({
        pendingReviewRequestGateway: gateway,
        queuePort: { hasActiveJob: (id) => activeJobIds.has(id) },
        logger,
      });
      const dismissResult = await dismissUseCase.execute({ pendingId: gateResult.pendingId });

      expect(dismissResult.status).toBe('dismissed');
      expect(claudeInvocations).toBe(0);

      const listUseCase = new ListPendingReviewsUseCase({ pendingReviewRequestGateway: gateway });
      const stillPending = await listUseCase.execute();
      expect(stillPending).toHaveLength(0);
    });
  });

  describe('Rule: a pending-confirmation job survives a process restart', () => {
    it('lists the pending job written to disk before any gateway instance existed', async () => {
      mkdirSync(pendingDir, { recursive: true });
      const handCraftedPending: PendingReviewRequest = {
        pendingReviewRequestId: 'pending-gitlab-group-project-42',
        job: createReviewJob(),
        jobType: 'review',
        platform: 'gitlab',
        triggerSource: 'webhook-initial',
        createdAt: '2026-05-23T10:00:00.000Z',
      };
      writeFileSync(
        join(pendingDir, 'pending-gitlab-group-project-42.json'),
        JSON.stringify(handCraftedPending),
      );

      const freshGateway = new PendingReviewRequestFileSystemGateway({ rootDir: pendingDir });
      const listUseCase = new ListPendingReviewsUseCase({
        pendingReviewRequestGateway: freshGateway,
      });

      const restored = await listUseCase.execute();

      expect(restored).toHaveLength(1);
      expect(restored[0].pendingReviewRequestId).toBe('pending-gitlab-group-project-42');
      expect(existsSync(join(pendingDir, 'pending-gitlab-group-project-42.json'))).toBe(true);
    });
  });
});
