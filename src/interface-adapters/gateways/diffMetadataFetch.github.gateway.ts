import type { DiffMetadataFetchGateway } from '../../entities/diffMetadata/diffMetadata.gateway.js'
import type { DiffMetadata } from '../../entities/reviewContext/reviewContext.js'

export type CommandExecutor = (command: string) => string

interface GitHubPullRequestResponse {
  base: { sha: string }
  head: { sha: string }
}

export class GitHubDiffMetadataFetchGateway implements DiffMetadataFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchDiffMetadata(projectPath: string, mergeRequestNumber: number): DiffMetadata {
    const response = this.executor(
      `gh api repos/${projectPath}/pulls/${mergeRequestNumber}`
    )
    const pr: GitHubPullRequestResponse = JSON.parse(response)

    return {
      baseSha: pr.base.sha,
      headSha: pr.head.sha,
      startSha: pr.base.sha,
    }
  }
}
