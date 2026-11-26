import type {
  ReviewSession,
  ReviewSessionListingGateway,
} from '@/modules/runtime-monitoring/entities/reviewSession/reviewSessionListing.gateway.js';

export class StubReviewSessionListingGateway implements ReviewSessionListingGateway {
  constructor(public sessions: ReviewSession[] | null = []) {}

  async list(): Promise<ReviewSession[] | null> {
    return this.sessions;
  }
}
