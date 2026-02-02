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

export class GitLabApiResponseFactory {
  static createDiscussionsResponse(discussions: GitLabDiscussion[]): string {
    return JSON.stringify(discussions)
  }
}
