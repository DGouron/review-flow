import type { DiffMetadataFetchGateway } from '../../entities/diffMetadata/diffMetadata.gateway.js'
import type { DiffMetadata } from '../../entities/reviewContext/reviewContext.js'

export type CommandExecutor = (command: string) => string

interface GitLabMergeRequestVersion {
  id: number
  base_commit_sha: string
  head_commit_sha: string
  start_commit_sha: string
}

export class GitLabDiffMetadataFetchGateway implements DiffMetadataFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchDiffMetadata(projectPath: string, mergeRequestNumber: number): DiffMetadata {
    const encodedProject = projectPath.replace(/\//g, '%2F')
    const response = this.executor(
      `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/versions`
    )
    const versions: GitLabMergeRequestVersion[] = JSON.parse(response)
    const latest = versions[versions.length - 1]

    return {
      baseSha: latest.base_commit_sha,
      headSha: latest.head_commit_sha,
      startSha: latest.start_commit_sha,
    }
  }
}
