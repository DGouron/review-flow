interface GitLabNotePosition {
  new_path: string | null
  new_line: number | null
}

interface GitLabNote {
  resolvable: boolean
  resolved: boolean
  body: string
  position: GitLabNotePosition | null
}

interface GitLabDiscussion {
  id: string
  notes: GitLabNote[]
}

interface GitLabMergeRequestVersion {
  id: number
  base_commit_sha: string
  head_commit_sha: string
  start_commit_sha: string
}

export class GitLabApiResponseFactory {
  static createDiscussionsResponse(discussions: GitLabDiscussion[]): string {
    return JSON.stringify(discussions)
  }

  static createVersionsResponse(versions: GitLabMergeRequestVersion[]): string {
    return JSON.stringify(versions)
  }
}
