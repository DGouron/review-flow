import type {
  ThreadInventoryGateway,
  ThreadInventoryPage,
} from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';

export type CommandExecutor = (command: string) => string;

interface GitLabDiscussion {
  id: string;
}

const HEADER_BODY_SEPARATOR = '\r\n\r\n';

function parseTotalPages(headers: string): number {
  const match = headers.match(/x-total-pages:\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 1;
}

/**
 * Authenticated GitLab Threads (discussions) inventory access.
 *
 * Issues `glab api -i` so the response carries the `X-Total-Pages` header used by the
 * resolver to prove pagination completeness (complete-or-empty, fail-closed).
 */
export class GitLabThreadInventoryGateway implements ThreadInventoryGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchPage(projectPath: string, mergeRequestNumber: number, page: number): ThreadInventoryPage {
    const encodedProject = projectPath.replace(/\//g, '%2F');
    const raw = this.executor(
      `glab api -i "projects/${encodedProject}/merge_requests/${mergeRequestNumber}/discussions?page=${page}&per_page=100"`,
    );

    const separatorIndex = raw.indexOf(HEADER_BODY_SEPARATOR);
    const headers = separatorIndex === -1 ? '' : raw.slice(0, separatorIndex);
    const body =
      separatorIndex === -1 ? raw : raw.slice(separatorIndex + HEADER_BODY_SEPARATOR.length);

    const discussions: GitLabDiscussion[] = JSON.parse(body);

    return {
      page,
      totalPages: parseTotalPages(headers),
      threadIds: discussions.map((discussion) => discussion.id),
    };
  }
}
