interface GitHubCommentData {
  author: string | null;
  body: string;
  createdAt: string;
}

interface GitHubThreadData {
  id: string;
  isResolved: boolean;
  path: string | null;
  line: number | null;
  body: string;
  comments?: GitHubCommentData[];
}

interface GitHubPullRequestData {
  base: { sha: string };
  head: { sha: string };
}

function toCommentNodes(thread: GitHubThreadData): unknown[] {
  const comments = thread.comments ?? [
    { author: 'maintainer', body: thread.body, createdAt: '2026-08-01T10:00:00Z' },
  ];

  return comments.map((comment) => ({
    author: comment.author === null ? null : { login: comment.author },
    body: comment.body,
    createdAt: comment.createdAt,
  }));
}

export class GitHubApiResponseFactory {
  static createPullRequestResponse(pr: GitHubPullRequestData): string {
    return JSON.stringify(pr);
  }

  static createReviewThreadsResponse(threads: GitHubThreadData[]): string {
    return JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: threads.map((thread) => ({
                id: thread.id,
                isResolved: thread.isResolved,
                path: thread.path,
                line: thread.line,
                comments: { nodes: toCommentNodes(thread) },
              })),
            },
          },
        },
      },
    });
  }
}
