interface GitHubThreadData {
  id: string
  isResolved: boolean
  path: string | null
  line: number | null
  body: string
}

export class GitHubApiResponseFactory {
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
