import type { ReviewRequestVerdict } from '@/modules/platform-integration/usecases/processReviewRequest.usecase.js';
import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';

export type WebhookReplyResult =
  | {
      kind: 'cleaned';
      mergeRequestNumber: number;
      jobCancelled: boolean;
      trackingArchived: boolean;
    }
  | { kind: 'merged'; mergeRequestNumber: number }
  | { kind: 'approved'; mergeRequestNumber: number }
  | { kind: 'unapproved'; mergeRequestNumber: number; reason: string }
  | { kind: 'ignored-with-number'; mergeRequestNumber: number; reason: string }
  | { kind: 'ignored'; reason: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'queued'; jobId: string; mergeRequestNumber: number }
  | { kind: 'followup-queued'; jobId: string; mergeRequestNumber: number }
  | { kind: 'deduplicated'; jobId: string; reason: string }
  | { kind: 'pending-confirmation'; pendingId: string | null; mergeRequestNumber: number }
  | { kind: 'pending-confirmation-untrusted'; mergeRequestNumber: number };

export interface WebhookReplyOptions {
  numberKey: 'mrNumber' | 'prNumber';
}

interface WebhookReplyTarget {
  status(code: number): { send(body: unknown): unknown };
}

export function sendWebhookReply(
  reply: WebhookReplyTarget,
  result: WebhookReplyResult,
  options: WebhookReplyOptions,
): void {
  const { numberKey } = options;

  switch (result.kind) {
    case 'cleaned':
      reply.status(200).send({
        status: 'cleaned',
        [numberKey]: result.mergeRequestNumber,
        jobCancelled: result.jobCancelled,
        trackingArchived: result.trackingArchived,
      });
      return;
    case 'merged':
      reply.status(200).send({ status: 'merged', [numberKey]: result.mergeRequestNumber });
      return;
    case 'approved':
      reply.status(200).send({ status: 'approved', [numberKey]: result.mergeRequestNumber });
      return;
    case 'unapproved':
      reply.status(200).send({
        status: 'unapproved',
        [numberKey]: result.mergeRequestNumber,
        reason: result.reason,
      });
      return;
    case 'ignored-with-number':
      reply.status(200).send({
        status: 'ignored',
        [numberKey]: result.mergeRequestNumber,
        reason: result.reason,
      });
      return;
    case 'ignored':
      reply.status(200).send({ status: 'ignored', reason: result.reason });
      return;
    case 'rejected':
      reply.status(200).send({ status: 'rejected', reason: result.reason });
      return;
    case 'queued':
      reply.status(202).send({
        status: 'queued',
        jobId: result.jobId,
        [numberKey]: result.mergeRequestNumber,
      });
      return;
    case 'followup-queued':
      reply.status(202).send({
        status: 'followup-queued',
        jobId: result.jobId,
        [numberKey]: result.mergeRequestNumber,
      });
      return;
    case 'deduplicated':
      reply.status(200).send({
        status: 'deduplicated',
        jobId: result.jobId,
        reason: result.reason,
      });
      return;
    case 'pending-confirmation':
      reply.status(202).send({
        status: 'pending-confirmation',
        pendingId: result.pendingId,
        [numberKey]: result.mergeRequestNumber,
      });
      return;
    case 'pending-confirmation-untrusted':
      reply.status(202).send({
        status: 'pending-confirmation',
        reason: 'untrusted-actor',
        [numberKey]: result.mergeRequestNumber,
      });
      return;
  }
}

export interface ReviewRequestReplyOptions {
  numberKey: 'mrNumber' | 'prNumber';
  mergeRequestNumber: number;
  jobId: string;
  /**
   * Initial reviews distinguish a freshly queued job from a deduplicated one
   * (`'queued'` + a `deduplicated` body). Followup pushes collapse both outcomes
   * into a single `'followup-queued'` reply, matching the historical wire contract.
   */
  flow: 'initial' | 'followup';
  onBudgetExceeded: (status: BudgetStatus) => void;
}

const DEDUPLICATED_REASON = 'Review already in progress or recently completed';

export function sendReviewRequestReply(
  reply: WebhookReplyTarget,
  verdict: ReviewRequestVerdict,
  options: ReviewRequestReplyOptions,
): void {
  const { numberKey, mergeRequestNumber, jobId, flow, onBudgetExceeded } = options;

  switch (verdict.type) {
    case 'budget-exceeded':
      onBudgetExceeded(verdict.status);
      sendWebhookReply(reply, { kind: 'rejected', reason: 'budget-exceeded' }, { numberKey });
      return;
    case 'pending':
      if (verdict.reason === 'untrusted-actor') {
        sendWebhookReply(
          reply,
          { kind: 'pending-confirmation-untrusted', mergeRequestNumber },
          { numberKey },
        );
        return;
      }
      sendWebhookReply(
        reply,
        { kind: 'pending-confirmation', pendingId: verdict.pendingId, mergeRequestNumber },
        { numberKey },
      );
      return;
    case 'queued':
      sendWebhookReply(
        reply,
        flow === 'followup'
          ? { kind: 'followup-queued', jobId, mergeRequestNumber }
          : { kind: 'queued', jobId, mergeRequestNumber },
        { numberKey },
      );
      return;
    case 'deduplicated':
      if (flow === 'followup') {
        sendWebhookReply(
          reply,
          { kind: 'followup-queued', jobId, mergeRequestNumber },
          { numberKey },
        );
        return;
      }
      sendWebhookReply(
        reply,
        { kind: 'deduplicated', jobId, reason: DEDUPLICATED_REASON },
        { numberKey },
      );
      return;
  }
}
