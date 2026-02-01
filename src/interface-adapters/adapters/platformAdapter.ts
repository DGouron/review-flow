import { GitLabMergeRequestAdapter } from './gitlabMergeRequest.adapter.js';
import { GitHubPullRequestAdapter } from './githubPullRequest.adapter.js';
import type { GitLabMergeRequestEvent, GitHubPullRequestEvent } from '../../webhooks/eventFilter.js';
import type { ReviewRequest } from '../../entities/reviewRequest/reviewRequest.entity.js';
import { parseReviewRequest } from '../../entities/reviewRequest/reviewRequest.guard.js';

export class PlatformAdapter {
  private gitlabAdapter = new GitLabMergeRequestAdapter();
  private githubAdapter = new GitHubPullRequestAdapter();

  translateGitLabEvent(event: GitLabMergeRequestEvent): ReviewRequest {
    const reviewRequest = this.gitlabAdapter.translate(event);
    return parseReviewRequest(reviewRequest);
  }

  translateGitHubEvent(event: GitHubPullRequestEvent): ReviewRequest {
    const reviewRequest = this.githubAdapter.translate(event);
    return parseReviewRequest(reviewRequest);
  }
}
