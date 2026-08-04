import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type {
  ThreadInventoryGateway,
  ThreadInventoryPage,
} from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';

/**
 * Authenticated GitHub thread inventory derived from the same gateway used to
 * pre-fetch the review context. A single complete page is sufficient: the
 * constrained-dispatch chokepoint only needs the authenticated id set, never the
 * webhook payload.
 */
export function buildGitHubInventoryGateway(
  threadFetchGateway: ThreadFetchGateway,
): ThreadInventoryGateway {
  return {
    fetchPage(projectPath: string, mergeRequestNumber: number): ThreadInventoryPage {
      const threads = threadFetchGateway.fetchThreads(projectPath, mergeRequestNumber);
      return { page: 1, totalPages: 1, threadIds: threads.map((thread) => thread.id) };
    },
  };
}
