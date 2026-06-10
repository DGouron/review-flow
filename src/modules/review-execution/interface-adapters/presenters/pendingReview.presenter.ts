import type {
  PendingReviewRequest,
  TriggerSource,
} from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import { Duration } from '@/modules/shared-kernel/entities/shared/duration.valueObject.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

export interface PendingReviewViewModel {
  identifier: string;
  mrNumber: number;
  displayTitle: string;
  projectPath: string;
  mrUrl: string;
  jobTypeLabel: string;
  triggerSourceLabel: string;
  createdAtRelative: string;
  confirmActionUrl: string;
  dismissActionUrl: string;
}

export interface PendingReviewPresenterOptions {
  now?: () => Date;
}

const TRIGGER_SOURCE_LABELS: Record<TriggerSource, string> = {
  'webhook-initial': 'Webhook',
  'webhook-followup': 'Webhook',
  'dashboard-manual': 'Manuel',
};

export class PendingReviewPresenter implements Presenter<
  PendingReviewRequest,
  PendingReviewViewModel
> {
  private readonly now: () => Date;

  constructor(options: PendingReviewPresenterOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  present(pending: PendingReviewRequest): PendingReviewViewModel {
    return {
      identifier: pending.pendingReviewRequestId,
      mrNumber: pending.job.mrNumber,
      displayTitle: this.formatDisplayTitle(pending),
      projectPath: pending.job.projectPath,
      mrUrl: pending.job.mrUrl,
      jobTypeLabel: pending.jobType === 'followup' ? 'Followup' : 'Review',
      triggerSourceLabel: TRIGGER_SOURCE_LABELS[pending.triggerSource],
      createdAtRelative: this.formatRelative(pending.createdAt),
      confirmActionUrl: `/api/pending-reviews/${pending.pendingReviewRequestId}/confirm`,
      dismissActionUrl: `/api/pending-reviews/${pending.pendingReviewRequestId}`,
    };
  }

  private formatDisplayTitle(pending: PendingReviewRequest): string {
    const title = pending.job.title ?? '';
    return title.length > 0
      ? `MR !${pending.job.mrNumber} - ${title}`
      : `MR !${pending.job.mrNumber}`;
  }

  private formatRelative(isoString: string): string {
    const createdAtMs = new Date(isoString).getTime();
    if (Number.isNaN(createdAtMs)) {
      return '';
    }
    const elapsedMs = Math.max(0, this.now().getTime() - createdAtMs);
    return `il y a ${Duration.fromMilliseconds(elapsedMs).formatted}`;
  }
}
