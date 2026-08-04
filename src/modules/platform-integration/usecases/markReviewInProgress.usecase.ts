import type { Logger } from 'pino';

import type { ReviewLabelGateway } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.js';
import {
  REVIEW_DONE_LABEL,
  REVIEW_IN_PROGRESS_LABEL,
} from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface MarkReviewInProgressDependencies {
  reviewLabelGateway: ReviewLabelGateway;
  logger: Logger;
}

export interface MarkReviewInProgressInput {
  projectPath: string;
  mrNumber: number;
}

export class MarkReviewInProgressUseCase implements UseCase<
  MarkReviewInProgressInput,
  Promise<void>
> {
  constructor(private readonly deps: MarkReviewInProgressDependencies) {}

  /** Never throws: a label failure is logged and swallowed (spec 221). */
  async execute(input: MarkReviewInProgressInput): Promise<void> {
    await this.removeStaleDoneLabel(input);

    const label = REVIEW_IN_PROGRESS_LABEL;
    try {
      await this.deps.reviewLabelGateway.ensureLabelExists({
        projectPath: input.projectPath,
        label,
      });
      await this.deps.reviewLabelGateway.addLabel({ ...input, label });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.logger.warn(
        { ...input, label, error: reason },
        `Failed to apply the ${label} label; the review proceeds unlabelled`,
      );
    }
  }

  /**
   * A merge request must never carry both labels at once (spec 222), so a stale
   * `review-done` left by a previous review is dropped first. Its own swallow keeps a
   * removal failure from skipping the in-progress label.
   */
  private async removeStaleDoneLabel(input: MarkReviewInProgressInput): Promise<void> {
    const label = REVIEW_DONE_LABEL;
    try {
      await this.deps.reviewLabelGateway.removeLabel({ ...input, label });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.logger.warn(
        { ...input, label, error: reason },
        `Failed to remove the stale ${label} label; the merge request may carry both labels`,
      );
    }
  }
}
