import type {
  OpenReviewRequest,
  ReviewRequestStateFetchGateway,
} from '@/modules/platform-integration/entities/reviewRequestState/reviewRequestStateFetch.gateway.js';
import type { ReviewRequestState } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.entity.js';

export class StubReviewRequestStateFetchGateway implements ReviewRequestStateFetchGateway {
  private readonly states = new Map<number, ReviewRequestState>();
  private readonly authors = new Map<number, OpenReviewRequest['author']>();
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

  givenOpenBy(reviewRequestNumber: number, author: OpenReviewRequest['author']): this {
    this.authors.set(reviewRequestNumber, author);
    return this.givenOpen(reviewRequestNumber);
  }

  listOpen(_project: string): OpenReviewRequest[] {
    return [...this.states.entries()]
      .filter(([, state]) => state === 'open')
      .map(([reviewRequestNumber]) => ({
        number: reviewRequestNumber,
        author: this.authors.get(reviewRequestNumber) ?? { username: 'octocat', displayName: null },
      }));
  }

  fetchState(_project: string, reviewRequestNumber: number): ReviewRequestState {
    this.fetchedNumbers.push(reviewRequestNumber);
    return this.states.get(reviewRequestNumber) ?? 'open';
  }
}
