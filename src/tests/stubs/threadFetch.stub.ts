import type { ThreadFetchGateway } from '../../entities/threadFetch/threadFetch.gateway.js';
import type { ReviewContextThread } from '../../entities/reviewContext/reviewContext.js';

export class InMemoryThreadFetchGateway implements ThreadFetchGateway {
  private threads: ReviewContextThread[] = [];

  fetchThreads(): ReviewContextThread[] {
    return this.threads;
  }

  setThreads(threads: ReviewContextThread[]): void {
    this.threads = threads;
  }
}
