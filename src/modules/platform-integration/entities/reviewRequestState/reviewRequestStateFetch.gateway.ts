import type { ReviewRequestState } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.entity.js';

export type OpenReviewRequest = {
  number: number;
  author: { username: string; displayName: string | null };
};

export interface ReviewRequestStateFetchGateway {
  listOpen(project: string): OpenReviewRequest[];
  fetchState(project: string, reviewRequestNumber: number): ReviewRequestState;
}
