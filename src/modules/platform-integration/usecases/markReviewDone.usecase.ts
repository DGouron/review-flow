import type { Logger } from 'pino';

import type { ReviewLabelGateway } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.js';
import { REVIEW_DONE_LABEL } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface MarkReviewDoneDependencies {
  reviewLabelGateway: ReviewLabelGateway;
  logger: Logger;
}

export interface MarkReviewDoneInput {
  projectPath: string;
  mrNumber: number;
}

export class MarkReviewDoneUseCase implements UseCase<MarkReviewDoneInput, Promise<void>> {
  constructor(private readonly deps: MarkReviewDoneDependencies) {}

  /** Never throws: a label failure is logged and swallowed (spec 222). */
  async execute(input: MarkReviewDoneInput): Promise<void> {
    const label = REVIEW_DONE_LABEL;
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
        `Failed to apply the ${label} label; the completed review stays unlabelled`,
      );
    }
  }
}
