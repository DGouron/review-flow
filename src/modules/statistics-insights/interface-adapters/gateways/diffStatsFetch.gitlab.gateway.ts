import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { SimpleCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type CommandExecutor = SimpleCommandExecutor;

interface GitLabMergeRequestStatsResponse {
  additions: number;
  deletions: number;
}

export class GitLabDiffStatsFetchGateway implements DiffStatsFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchDiffStats(projectPath: string, mergeRequestNumber: number): DiffStats | null {
    try {
      const encodedProject = projectPath.replace(/\//g, '%2F');

      const mrResponse = this.executor(
        `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}`,
      );
      const mergeRequest: GitLabMergeRequestStatsResponse = JSON.parse(mrResponse);

      if (
        typeof mergeRequest.additions !== 'number' ||
        typeof mergeRequest.deletions !== 'number'
      ) {
        return null;
      }

      const commitsResponse = this.executor(
        `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/commits`,
      );
      const commits: unknown[] = JSON.parse(commitsResponse);

      return {
        additions: mergeRequest.additions,
        deletions: mergeRequest.deletions,
        commitsCount: Array.isArray(commits) ? commits.length : 0,
      };
    } catch {
      return null;
    }
  }
}
