import type { GitLabMergeRequestEvent } from '../../webhooks/eventFilter.js';
import type { ReviewRequest, ReviewRequestState } from '../../entities/reviewRequest/reviewRequest.entity.js';

function mapGitLabState(gitlabState: string): ReviewRequestState {
  switch (gitlabState) {
    case 'opened':
      return 'open';
    case 'closed':
    case 'locked':
      return 'closed';
    case 'merged':
      return 'merged';
    default:
      return 'open';
  }
}

export class GitLabMergeRequestAdapter {
  translate(event: GitLabMergeRequestEvent): ReviewRequest {
    const mergeRequest = event.object_attributes;

    return {
      platform: 'gitlab',
      projectPath: event.project.path_with_namespace,
      reviewRequestNumber: mergeRequest.iid,
      title: mergeRequest.title,
      description: mergeRequest.description,
      sourceBranch: mergeRequest.source_branch,
      targetBranch: mergeRequest.target_branch,
      state: mapGitLabState(mergeRequest.state),
      isDraft: mergeRequest.draft ?? false,
      author: event.user.username,
      assignedReviewer: event.reviewers?.[0]?.username,
      webUrl: mergeRequest.url,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
