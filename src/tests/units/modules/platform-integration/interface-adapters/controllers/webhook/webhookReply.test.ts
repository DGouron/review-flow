import { describe, it, expect, vi } from 'vitest';

import {
  sendWebhookReply,
  sendReviewRequestReply,
  type WebhookReplyResult,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.js';
import type { ReviewRequestVerdict } from '@/modules/platform-integration/usecases/processReviewRequest.usecase.js';
import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';

function shapeReply(result: WebhookReplyResult, numberKey: 'mrNumber' | 'prNumber') {
  const sendSpy = vi.fn<(body: unknown) => unknown>();
  const statusSpy = vi.fn<(code: number) => { send(body: unknown): unknown }>(() => ({
    send: sendSpy,
  }));
  sendWebhookReply({ status: statusSpy }, result, { numberKey });
  return {
    status: statusSpy.mock.calls[0]?.[0],
    body: sendSpy.mock.calls[0]?.[0],
  };
}

function exceededBudget(): BudgetStatus {
  return {
    limitUsd: 200,
    consumedUsd: 250,
    remainingUsd: -50,
    percentUsed: 125,
    exceeded: true,
    periodStart: '2026-05-01T00:00:00.000Z',
  };
}

function shapeVerdict(
  verdict: ReviewRequestVerdict,
  numberKey: 'mrNumber' | 'prNumber',
  flow: 'initial' | 'followup',
) {
  const sendSpy = vi.fn<(body: unknown) => unknown>();
  const statusSpy = vi.fn<(code: number) => { send(body: unknown): unknown }>(() => ({
    send: sendSpy,
  }));
  const onBudgetExceeded = vi.fn<(status: BudgetStatus) => void>();
  sendReviewRequestReply({ status: statusSpy }, verdict, {
    numberKey,
    mergeRequestNumber: 42,
    jobId: 'job-1',
    flow,
    onBudgetExceeded,
  });
  return {
    status: statusSpy.mock.calls[0]?.[0],
    body: sendSpy.mock.calls[0]?.[0],
    budgetCalls: onBudgetExceeded.mock.calls,
  };
}

describe('sendWebhookReply', () => {
  describe('cleaned variant', () => {
    const result: WebhookReplyResult = {
      kind: 'cleaned',
      mergeRequestNumber: 42,
      jobCancelled: true,
      trackingArchived: false,
    };

    it('shapes the GitLab body with mrNumber', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: { status: 'cleaned', mrNumber: 42, jobCancelled: true, trackingArchived: false },
      });
    });

    it('shapes the GitHub body with prNumber', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 200,
        body: { status: 'cleaned', prNumber: 42, jobCancelled: true, trackingArchived: false },
      });
    });
  });

  describe('merged variant', () => {
    const result: WebhookReplyResult = { kind: 'merged', mergeRequestNumber: 7 };

    it('shapes the GitLab body with mrNumber', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: { status: 'merged', mrNumber: 7 },
      });
    });

    it('shapes the GitHub body with prNumber', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 200,
        body: { status: 'merged', prNumber: 7 },
      });
    });
  });

  describe('approved variant', () => {
    const result: WebhookReplyResult = { kind: 'approved', mergeRequestNumber: 5 };

    it('shapes the GitLab body with mrNumber', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: { status: 'approved', mrNumber: 5 },
      });
    });

    it('shapes the GitHub body with prNumber', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 200,
        body: { status: 'approved', prNumber: 5 },
      });
    });
  });

  describe('unapproved variant', () => {
    const result: WebhookReplyResult = {
      kind: 'unapproved',
      mergeRequestNumber: 9,
      reason: 'below-threshold',
    };

    it('shapes the GitLab body with mrNumber and reason', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: { status: 'unapproved', mrNumber: 9, reason: 'below-threshold' },
      });
    });

    it('shapes the GitHub body with prNumber and reason', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 200,
        body: { status: 'unapproved', prNumber: 9, reason: 'below-threshold' },
      });
    });
  });

  describe('ignored-with-number variant', () => {
    const result: WebhookReplyResult = {
      kind: 'ignored-with-number',
      mergeRequestNumber: 11,
      reason: 'not-found',
    };

    it('shapes the GitLab body with mrNumber and reason', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: { status: 'ignored', mrNumber: 11, reason: 'not-found' },
      });
    });

    it('shapes the GitHub body with prNumber and reason', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 200,
        body: { status: 'ignored', prNumber: 11, reason: 'not-found' },
      });
    });
  });

  describe('ignored variant (no number key)', () => {
    const result: WebhookReplyResult = { kind: 'ignored', reason: 'Repository not configured' };

    it('shapes a status-200 body with reason only', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: { status: 'ignored', reason: 'Repository not configured' },
      });
    });
  });

  describe('rejected variant (budget)', () => {
    const result: WebhookReplyResult = { kind: 'rejected', reason: 'budget-exceeded' };

    it('shapes a status-200 body with reason only', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 200,
        body: { status: 'rejected', reason: 'budget-exceeded' },
      });
    });
  });

  describe('queued variant', () => {
    const result: WebhookReplyResult = { kind: 'queued', jobId: 'job-1', mergeRequestNumber: 42 };

    it('shapes the GitLab body with jobId and mrNumber at status 202', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 202,
        body: { status: 'queued', jobId: 'job-1', mrNumber: 42 },
      });
    });

    it('shapes the GitHub body with jobId and prNumber at status 202', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 202,
        body: { status: 'queued', jobId: 'job-1', prNumber: 42 },
      });
    });
  });

  describe('followup-queued variant', () => {
    const result: WebhookReplyResult = {
      kind: 'followup-queued',
      jobId: 'job-2',
      mergeRequestNumber: 8,
    };

    it('shapes the GitLab body with jobId and mrNumber at status 202', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 202,
        body: { status: 'followup-queued', jobId: 'job-2', mrNumber: 8 },
      });
    });

    it('shapes the GitHub body with jobId and prNumber at status 202', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 202,
        body: { status: 'followup-queued', jobId: 'job-2', prNumber: 8 },
      });
    });
  });

  describe('deduplicated variant (no number key)', () => {
    const result: WebhookReplyResult = {
      kind: 'deduplicated',
      jobId: 'job-3',
      reason: 'Review already in progress or recently completed',
    };

    it('shapes a status-200 body with jobId and reason', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 200,
        body: {
          status: 'deduplicated',
          jobId: 'job-3',
          reason: 'Review already in progress or recently completed',
        },
      });
    });
  });

  describe('pending-confirmation variant with pendingId', () => {
    const result: WebhookReplyResult = {
      kind: 'pending-confirmation',
      pendingId: 'pending-1',
      mergeRequestNumber: 13,
    };

    it('shapes the GitLab body with pendingId and mrNumber at status 202', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 202,
        body: { status: 'pending-confirmation', pendingId: 'pending-1', mrNumber: 13 },
      });
    });

    it('shapes the GitHub body with pendingId and prNumber at status 202', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 202,
        body: { status: 'pending-confirmation', pendingId: 'pending-1', prNumber: 13 },
      });
    });
  });

  describe('pending-confirmation variant for untrusted actor', () => {
    const result: WebhookReplyResult = {
      kind: 'pending-confirmation-untrusted',
      mergeRequestNumber: 21,
    };

    it('shapes the GitLab body with untrusted-actor reason and mrNumber at status 202', () => {
      expect(shapeReply(result, 'mrNumber')).toEqual({
        status: 202,
        body: { status: 'pending-confirmation', reason: 'untrusted-actor', mrNumber: 21 },
      });
    });

    it('shapes the GitHub body with untrusted-actor reason and prNumber at status 202', () => {
      expect(shapeReply(result, 'prNumber')).toEqual({
        status: 202,
        body: { status: 'pending-confirmation', reason: 'untrusted-actor', prNumber: 21 },
      });
    });
  });
});

describe('sendReviewRequestReply', () => {
  describe('budget-exceeded verdict', () => {
    const verdict: ReviewRequestVerdict = { type: 'budget-exceeded', status: exceededBudget() };

    it('invokes the budget broadcast callback with the status and replies rejected (200)', () => {
      const result = shapeVerdict(verdict, 'mrNumber', 'initial');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'rejected', reason: 'budget-exceeded' });
      expect(result.budgetCalls).toEqual([[exceededBudget()]]);
    });

    it('replies rejected for prNumber too', () => {
      const result = shapeVerdict(verdict, 'prNumber', 'followup');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'rejected', reason: 'budget-exceeded' });
    });
  });

  describe('queued verdict', () => {
    const verdict: ReviewRequestVerdict = { type: 'queued', jobId: 'job-1' };

    it('initial flow shapes a queued reply at 202', () => {
      expect(shapeVerdict(verdict, 'mrNumber', 'initial')).toMatchObject({
        status: 202,
        body: { status: 'queued', jobId: 'job-1', mrNumber: 42 },
      });
    });

    it('followup flow shapes a followup-queued reply at 202', () => {
      expect(shapeVerdict(verdict, 'prNumber', 'followup')).toMatchObject({
        status: 202,
        body: { status: 'followup-queued', jobId: 'job-1', prNumber: 42 },
      });
    });
  });

  describe('deduplicated verdict', () => {
    const verdict: ReviewRequestVerdict = { type: 'deduplicated', jobId: 'job-1' };

    it('initial flow shapes a deduplicated reply at 200', () => {
      expect(shapeVerdict(verdict, 'mrNumber', 'initial')).toMatchObject({
        status: 200,
        body: {
          status: 'deduplicated',
          jobId: 'job-1',
          reason: 'Review already in progress or recently completed',
        },
      });
    });

    it('followup flow collapses a deduplicated outcome into followup-queued at 202', () => {
      expect(shapeVerdict(verdict, 'prNumber', 'followup')).toMatchObject({
        status: 202,
        body: { status: 'followup-queued', jobId: 'job-1', prNumber: 42 },
      });
    });
  });

  describe('pending verdict', () => {
    it('shapes a pending-confirmation reply with pendingId at 202', () => {
      const verdict: ReviewRequestVerdict = { type: 'pending', pendingId: 'pending-1' };
      expect(shapeVerdict(verdict, 'mrNumber', 'initial')).toMatchObject({
        status: 202,
        body: { status: 'pending-confirmation', pendingId: 'pending-1', mrNumber: 42 },
      });
    });

    it('shapes an untrusted-actor pending reply without a pendingId at 202', () => {
      const verdict: ReviewRequestVerdict = {
        type: 'pending',
        pendingId: null,
        reason: 'untrusted-actor',
      };
      expect(shapeVerdict(verdict, 'prNumber', 'initial')).toMatchObject({
        status: 202,
        body: { status: 'pending-confirmation', reason: 'untrusted-actor', prNumber: 42 },
      });
    });
  });
});
