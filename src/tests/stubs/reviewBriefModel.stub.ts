import type {
  ReviewBriefModelGateway,
  ReviewBriefModelRequest,
  ReviewBriefModelResult,
} from '@/modules/review-brief/entities/reviewBrief/reviewBriefModel.gateway.js';
import { ReviewBriefFactory } from '@/tests/factories/reviewBrief.factory.js';

export class StubReviewBriefModelGateway implements ReviewBriefModelGateway {
  requests: ReviewBriefModelRequest[] = [];
  private result: ReviewBriefModelResult = {
    status: 'completed',
    text: JSON.stringify(ReviewBriefFactory.modelOutput()),
  };

  async generate(request: ReviewBriefModelRequest): Promise<ReviewBriefModelResult> {
    this.requests.push(request);
    return this.result;
  }

  respondWith(text: string): void {
    this.result = { status: 'completed', text };
  }

  failWith(reason: string): void {
    this.result = { status: 'failed', reason };
  }
}
