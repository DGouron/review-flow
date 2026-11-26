import type { ReviewRequestState } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.entity.js';

export interface ReviewRequestStateFetchGateway {
  listOpenNumbers(project: string): number[];
  fetchState(project: string, reviewRequestNumber: number): ReviewRequestState;
}
