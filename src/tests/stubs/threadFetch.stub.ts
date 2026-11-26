import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export class InMemoryThreadFetchGateway implements ThreadFetchGateway {
  private threads: ReviewContextThread[] = [];
  private failure: Error | null = null;

  fetchThreads(): ReviewContextThread[] {
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.threads;
  }

  setFailure(failure: Error): void {
    this.failure = failure;
  }

  setThreads(threads: ReviewContextThread[]): void {
    this.threads = threads;
  }
}
