import type {
  EnsureReviewLabelInput,
  ReviewLabelGateway,
  ReviewLabelInput,
} from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.js';

type ReviewLabelOperation = 'ensureLabelExists' | 'addLabel' | 'removeLabel';

export class StubReviewLabelGateway implements ReviewLabelGateway {
  readonly ensured: EnsureReviewLabelInput[] = [];
  readonly added: ReviewLabelInput[] = [];
  readonly removed: ReviewLabelInput[] = [];
  readonly operations: ReviewLabelOperation[] = [];

  private failing: Set<ReviewLabelOperation> = new Set();

  failOn(operation: ReviewLabelOperation): void {
    this.failing.add(operation);
  }

  async ensureLabelExists(input: EnsureReviewLabelInput): Promise<void> {
    this.record('ensureLabelExists');
    this.ensured.push(input);
  }

  async addLabel(input: ReviewLabelInput): Promise<void> {
    this.record('addLabel');
    this.added.push(input);
  }

  async removeLabel(input: ReviewLabelInput): Promise<void> {
    this.record('removeLabel');
    this.removed.push(input);
  }

  private record(operation: ReviewLabelOperation): void {
    this.operations.push(operation);
    if (this.failing.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}
