import type {
  ReviewRequestOverview,
  ReviewRequestOverviewFetchGateway,
} from '@/modules/review-brief/entities/reviewBrief/reviewRequestOverview.gateway.js';

export class StubReviewRequestOverviewFetchGateway implements ReviewRequestOverviewFetchGateway {
  private overviews = new Map<number, ReviewRequestOverview | null>();
  fetchedProjectPaths: string[] = [];

  fetchOverview(projectPath: string, mergeRequestNumber: number): ReviewRequestOverview | null {
    this.fetchedProjectPaths.push(projectPath);
    return this.overviews.get(mergeRequestNumber) ?? null;
  }

  setOverview(mergeRequestNumber: number, overview: ReviewRequestOverview | null): void {
    this.overviews.set(mergeRequestNumber, overview);
  }
}
