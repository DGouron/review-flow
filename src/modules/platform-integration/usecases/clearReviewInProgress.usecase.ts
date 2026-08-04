import type { Logger } from 'pino';

import type { ReviewLabelGateway } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.js';
import { REVIEW_IN_PROGRESS_LABEL } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface ClearReviewInProgressDependencies {
  reviewLabelGateway: ReviewLabelGateway;
  logger: Logger;
}

export interface ClearReviewInProgressInput {
  projectPath: string;
  mrNumber: number;
}

export class ClearReviewInProgressUseCase implements UseCase<
  ClearReviewInProgressInput,
  Promise<void>
> {
  constructor(private readonly deps: ClearReviewInProgressDependencies) {}

  /** Never throws: a label failure is logged and swallowed (spec 221). */
  async execute(input: ClearReviewInProgressInput): Promise<void> {
    const label = REVIEW_IN_PROGRESS_LABEL;
    try {
      await this.deps.reviewLabelGateway.removeLabel({ ...input, label });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.logger.warn(
        { ...input, label, error: reason },
        `Failed to remove the ${label} label; it may stay on the merge request`,
      );
    }
  }
}
