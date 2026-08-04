import { describe, it, expect, beforeEach } from 'vitest';

import { REVIEW_IN_PROGRESS_LABEL } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import { ClearReviewInProgressUseCase } from '@/modules/platform-integration/usecases/clearReviewInProgress.usecase.js';
import { createCapturingLogger, type CapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewLabelGateway } from '@/tests/stubs/reviewLabel.stub.js';

const TARGET = { projectPath: 'test-org/test-project', mrNumber: 42 };

describe('ClearReviewInProgressUseCase', () => {
  let reviewLabelGateway: StubReviewLabelGateway;
  let capturing: CapturingLogger;
  let useCase: ClearReviewInProgressUseCase;

  beforeEach(() => {
    reviewLabelGateway = new StubReviewLabelGateway();
    capturing = createCapturingLogger();
    useCase = new ClearReviewInProgressUseCase({
      reviewLabelGateway,
      logger: capturing.logger,
    });
  });

  it('removes the in-progress label from the requested merge request', async () => {
    await useCase.execute(TARGET);

    expect(reviewLabelGateway.removed).toEqual([{ ...TARGET, label: REVIEW_IN_PROGRESS_LABEL }]);
  });

  it('logs a warning and resolves when removing the label fails', async () => {
    reviewLabelGateway.failOn('removeLabel');

    await expect(useCase.execute(TARGET)).resolves.toBeUndefined();

    expect(capturing.warnMessages).toHaveLength(1);
    expect(capturing.warnMessages[0]).toContain(REVIEW_IN_PROGRESS_LABEL);
  });
});
