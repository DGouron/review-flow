import type { GitHubPullRequestEvent } from '../../webhooks/eventFilter.js';
import type { ReviewRequest, ReviewRequestState } from '../../entities/reviewRequest/reviewRequest.entity.js';

function mapGitHubState(state: string, merged?: boolean): ReviewRequestState {
  if (merged) return 'merged';
  return state === 'open' ? 'open' : 'closed';
}

export class GitHubPullRequestAdapter {
  translate(event: GitHubPullRequestEvent): ReviewRequest {
    const pullRequest = event.pull_request;

    return {
      platform: 'github',
      projectPath: event.repository.full_name,
      reviewRequestNumber: pullRequest.number,
      title: pullRequest.title,
      description: pullRequest.body,
      sourceBranch: pullRequest.head.ref,
      targetBranch: pullRequest.base.ref,
      state: mapGitHubState(pullRequest.state),
      isDraft: pullRequest.draft,
      author: event.sender.login,
      assignedReviewer: event.requested_reviewer?.login ?? pullRequest.requested_reviewers?.[0]?.login,
      webUrl: pullRequest.html_url,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
