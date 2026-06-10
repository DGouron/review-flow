import type { ReviewRequest } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.entity.js';
import { parseReviewRequest } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.guard.js';

import type {
  GitLabMergeRequestEvent,
  GitHubPullRequestEvent,
} from '../controllers/webhook/eventFilter.js';
import { GitHubPullRequestAdapter } from './githubPullRequest.adapter.js';
import { GitLabMergeRequestAdapter } from './gitlabMergeRequest.adapter.js';

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
