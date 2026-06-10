import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { SimpleCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type CommandExecutor = SimpleCommandExecutor;

interface GitHubPullRequestStatsResponse {
  additions: number;
  deletions: number;
  commits: number;
}

export class GitHubDiffStatsFetchGateway implements DiffStatsFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchDiffStats(projectPath: string, mergeRequestNumber: number): DiffStats | null {
    try {
      const response = this.executor(`gh api repos/${projectPath}/pulls/${mergeRequestNumber}`);
      const pullRequest: GitHubPullRequestStatsResponse = JSON.parse(response);

      if (
        typeof pullRequest.additions !== 'number' ||
        typeof pullRequest.deletions !== 'number' ||
        typeof pullRequest.commits !== 'number'
      ) {
        return null;
      }

      return {
        commitsCount: pullRequest.commits,
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
      };
    } catch {
      return null;
    }
  }
}
