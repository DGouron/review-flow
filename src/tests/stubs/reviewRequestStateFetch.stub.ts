import type { ReviewRequestStateFetchGateway } from '@/modules/platform-integration/entities/reviewRequestState/reviewRequestStateFetch.gateway.js';
import type { ReviewRequestState } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.entity.js';

export class StubReviewRequestStateFetchGateway implements ReviewRequestStateFetchGateway {
  private readonly states = new Map<number, ReviewRequestState>();
  readonly fetchedNumbers: number[] = [];

  givenPlatformState(reviewRequestNumber: number, state: ReviewRequestState): this {
    this.states.set(reviewRequestNumber, state);
    return this;
  }

  givenOpen(...reviewRequestNumbers: number[]): this {
    for (const reviewRequestNumber of reviewRequestNumbers) {
      this.givenPlatformState(reviewRequestNumber, 'open');
    }
    return this;
  }

  listOpenNumbers(_project: string): number[] {
    return [...this.states.entries()]
      .filter(([, state]) => state === 'open')
      .map(([reviewRequestNumber]) => reviewRequestNumber);
  }

  fetchState(_project: string, reviewRequestNumber: number): ReviewRequestState {
    this.fetchedNumbers.push(reviewRequestNumber);
    return this.states.get(reviewRequestNumber) ?? 'open';
  }
}
