import type { ThreadInventoryGateway } from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';

export interface PinnedMergeRequest {
  projectPath: string;
  mrNumber: number;
}

interface InventoryLogger {
  error: (obj: object, message: string) => void;
}

const MAX_PAGES = 100;

/**
 * Resolves the authenticated MR thread inventory, fail-closed.
 *
 * The inventory is built ONLY from the authenticated gateway, never from the
 * inbound webhook payload. It is either provably complete (every advertised page
 * followed) or provably empty. Any failure — fetch error, page-count mismatch,
 * undelivered page — resolves to the empty set with no payload/partial fallback.
 */
export function resolveThreadInventory(
  gateway: ThreadInventoryGateway,
  pinned: PinnedMergeRequest,
  logger: InventoryLogger,
): ReadonlySet<string> {
  try {
    const first = gateway.fetchPage(pinned.projectPath, pinned.mrNumber, 1);
    const totalPages = first.totalPages;
    const ids = new Set<string>(first.threadIds);

    if (totalPages < 1 || totalPages > MAX_PAGES) {
      logger.error(
        { projectPath: pinned.projectPath, mrNumber: pinned.mrNumber, totalPages },
        'thread inventory: implausible page count, failing closed to empty inventory',
      );
      return new Set<string>();
    }

    for (let page = 2; page <= totalPages; page++) {
      const next = gateway.fetchPage(pinned.projectPath, pinned.mrNumber, page);
      if (next.totalPages !== totalPages) {
        logger.error(
          { projectPath: pinned.projectPath, mrNumber: pinned.mrNumber, page },
          'thread inventory: page-count mismatch, failing closed to empty inventory',
        );
        return new Set<string>();
      }
      for (const id of next.threadIds) ids.add(id);
    }

    return ids;
  } catch (error) {
    logger.error(
      {
        projectPath: pinned.projectPath,
        mrNumber: pinned.mrNumber,
        error: error instanceof Error ? error.message : String(error),
      },
      'thread inventory: fetch failed, failing closed to empty inventory',
    );
    return new Set<string>();
  }
}
