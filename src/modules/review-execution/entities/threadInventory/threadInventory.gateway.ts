export interface ThreadInventoryPage {
  page: number;
  totalPages: number;
  threadIds: string[];
}

/**
 * Authenticated, page-by-page access to the current MR's thread inventory.
 * Each page carries its own `totalPages` so the resolver can prove completeness.
 */
export interface ThreadInventoryGateway {
  fetchPage(projectPath: string, mergeRequestNumber: number, page: number): ThreadInventoryPage;
}
