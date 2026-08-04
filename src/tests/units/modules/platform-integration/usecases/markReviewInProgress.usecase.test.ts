import { describe, it, expect, beforeEach } from 'vitest';

import { REVIEW_IN_PROGRESS_LABEL } from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.js';
import { MarkReviewInProgressUseCase } from '@/modules/platform-integration/usecases/markReviewInProgress.usecase.js';
import { createCapturingLogger, type CapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubReviewLabelGateway } from '@/tests/stubs/reviewLabel.stub.js';

const TARGET = { projectPath: 'test-org/test-project', mrNumber: 42 };

describe('MarkReviewInProgressUseCase', () => {
  let reviewLabelGateway: StubReviewLabelGateway;
  let capturing: CapturingLogger;
  let useCase: MarkReviewInProgressUseCase;

  beforeEach(() => {
    reviewLabelGateway = new StubReviewLabelGateway();
    capturing = createCapturingLogger();
    useCase = new MarkReviewInProgressUseCase({
      reviewLabelGateway,
      logger: capturing.logger,
    });
  });

  it('ensures the label exists before applying it to the merge request', async () => {
    await useCase.execute(TARGET);

    expect(reviewLabelGateway.operations).toEqual(['ensureLabelExists', 'addLabel']);
  });

  it('applies the in-progress label to the requested merge request', async () => {
    await useCase.execute(TARGET);

    expect(reviewLabelGateway.ensured).toEqual([
      { projectPath: TARGET.projectPath, label: REVIEW_IN_PROGRESS_LABEL },
    ]);
    expect(reviewLabelGateway.added).toEqual([{ ...TARGET, label: REVIEW_IN_PROGRESS_LABEL }]);
  });

  it('logs a warning and resolves when applying the label fails', async () => {
    reviewLabelGateway.failOn('addLabel');

    await expect(useCase.execute(TARGET)).resolves.toBeUndefined();

    expect(capturing.warnMessages).toHaveLength(1);
    expect(capturing.warnMessages[0]).toContain(REVIEW_IN_PROGRESS_LABEL);
  });

  it('logs a warning and resolves when the gateway fails to ensure the label', async () => {
    reviewLabelGateway.failOn('ensureLabelExists');

    await expect(useCase.execute(TARGET)).resolves.toBeUndefined();

    expect(capturing.warnMessages).toHaveLength(1);
  });
});
