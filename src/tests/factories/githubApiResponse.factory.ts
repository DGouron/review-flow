interface GitHubThreadData {
  id: string
  isResolved: boolean
  path: string | null
  line: number | null
  body: string
}

interface GitHubPullRequestData {
  base: { sha: string }
  head: { sha: string }
}

export class GitHubApiResponseFactory {
  static createPullRequestResponse(pr: GitHubPullRequestData): string {
    return JSON.stringify(pr)
  }

  static createReviewThreadsResponse(threads: GitHubThreadData[]): string {
    return JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: threads.map(thread => ({
                id: thread.id,
                isResolved: thread.isResolved,
                path: thread.path,
                line: thread.line,
                comments: { nodes: [{ body: thread.body }] }
              }))
            }
          }
        }
      }
    })
  }
}
