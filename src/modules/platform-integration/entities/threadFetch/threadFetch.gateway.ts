import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export interface ThreadFetchGateway {
  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[];
}
