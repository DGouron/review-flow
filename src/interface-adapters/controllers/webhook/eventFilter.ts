import { loadConfig } from '../../../config/loader.js';
import type { GitHubPullRequestEvent } from '../../../entities/github/githubPullRequestEvent.guard.js';

export type { GitHubPullRequestEvent };

// GitLab MR Event types
export interface GitLabMergeRequestEvent {
  object_kind: 'merge_request';
  event_type: string;
  user: {
    username: string;
    name: string;
  };
  project: {
    id: number;
    name: string;
    path_with_namespace: string;
    web_url: string;
    git_http_url: string;
  };
  object_attributes: {
    iid: number;
    title: string;
    description?: string;
    state: 'opened' | 'closed' | 'merged' | 'locked';
    action: string;
    source_branch: string;
    target_branch: string;
    url: string;
    draft?: boolean;
  };
  reviewers?: Array<{
    username: string;
    name: string;
  }>;
  changes?: {
    reviewers?: {
      previous: Array<{ username: string }>;
      current: Array<{ username: string }>;
    };
  };
}

export const REVIEW_TRIGGER_LABEL = 'needs-review';

export type FilterResult =
  | { shouldProcess: false; reason: string }
  | {
      shouldProcess: true;
      reason: string;
      mergeRequestNumber: number;
      projectPath: string;
      mergeRequestUrl: string;
      sourceBranch: string;
      targetBranch: string;
      isFollowup?: boolean;
    };

// GitLab Push Event type
export interface GitLabPushEvent {
  object_kind: 'push';
  ref: string;
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
  commits: Array<{
    id: string;
    message: string;
  }>;
}

/**
 * Filter GitLab MR events
 * Returns true if we should trigger a review
 */
export function filterGitLabEvent(event: GitLabMergeRequestEvent): FilterResult {
  const config = loadConfig();
  const myUsername = config.user.gitlabUsername;

  // Must be a merge_request event
  if (event.object_kind !== 'merge_request') {
    return { shouldProcess: false, reason: 'Not a merge request event' };
  }

  const mr = event.object_attributes;

  // MR must be open
  if (mr.state !== 'opened') {
    return { shouldProcess: false, reason: `MR state is ${mr.state}, not opened` };
  }

  // Skip draft MRs
  if (mr.draft) {
    return { shouldProcess: false, reason: 'MR is a draft' };
  }

  // Check if I was added as a reviewer
  const wasAddedAsReviewer = checkGitLabReviewerAdded(event, myUsername);

  if (!wasAddedAsReviewer) {
    return {
      shouldProcess: false,
      reason: `${myUsername} was not added as reviewer in this event`,
    };
  }

  return {
    shouldProcess: true,
    reason: `${myUsername} was assigned as reviewer`,
    mergeRequestNumber: mr.iid,
    projectPath: event.project.path_with_namespace,
    mergeRequestUrl: mr.url,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
  };
}

/**
 * Check if user was NEWLY ADDED as a reviewer on this MR
 * Only triggers when: user is in current reviewers BUT was NOT in previous reviewers
 * This prevents triggering on MR updates when user is already assigned
 */
function checkGitLabReviewerAdded(
  event: GitLabMergeRequestEvent,
  username: string
): boolean {
  // STRICT CHECK: Only trigger if changes.reviewers shows user was ADDED
  if (event.changes?.reviewers) {
    const wasInPrevious = event.changes.reviewers.previous?.some(r => r.username === username) ?? false;
    const isInCurrent = event.changes.reviewers.current?.some(r => r.username === username) ?? false;

    // Only trigger if user was ADDED (in current but not in previous)
    return isInCurrent && !wasInPrevious;
  }

  // No changes.reviewers = no reviewer change = don't trigger
  // This prevents triggering on other MR update events
  return false;
}

/**
 * Check if a GitLab MR event is an update that might need a followup review
 * This is called for MRs that are not initial review requests but may have new commits
 */
export function filterGitLabMrUpdate(event: GitLabMergeRequestEvent): FilterResult {
  const mr = event.object_attributes;

  // MR must be open
  if (mr.state !== 'opened') {
    return { shouldProcess: false, reason: `MR state is ${mr.state}, not opened` };
  }

  // Skip draft MRs
  if (mr.draft) {
    return { shouldProcess: false, reason: 'MR is a draft' };
  }

  // Only process "update" action (new commits pushed)
  if (mr.action !== 'update') {
    return { shouldProcess: false, reason: `Action is ${mr.action}, not update` };
  }

  return {
    shouldProcess: true,
    reason: 'MR was updated (potential new commits)',
    mergeRequestNumber: mr.iid,
    projectPath: event.project.path_with_namespace,
    mergeRequestUrl: mr.url,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    isFollowup: true,
  };
}

/**
 * Check if a GitLab MR was closed (not merged)
 * Returns info to clean up tracking
 */
export function filterGitLabMrClose(event: GitLabMergeRequestEvent): FilterResult {
  const mr = event.object_attributes;

  // Check if action is "close" (MR closed without merging)
  if (mr.action !== 'close') {
    return { shouldProcess: false, reason: `Action is ${mr.action}, not close` };
  }

  // Verify state is closed
  if (mr.state !== 'closed') {
    return { shouldProcess: false, reason: `State is ${mr.state}, not closed` };
  }

  return {
    shouldProcess: true,
    reason: 'MR was closed',
    mergeRequestNumber: mr.iid,
    projectPath: event.project.path_with_namespace,
    mergeRequestUrl: mr.url,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
  };
}

/**
 * Filter GitHub PR events
 * Returns true if we should trigger a review
 */
export function filterGitHubEvent(event: GitHubPullRequestEvent): FilterResult {
  const config = loadConfig();
  const myUsername = config.user.githubUsername;

  // Check event action
  // "review_requested" is sent when someone is requested for review
  if (event.action !== 'review_requested') {
    return { shouldProcess: false, reason: `Action is ${event.action}, not review_requested` };
  }

  const pr = event.pull_request;

  // PR must be open
  if (pr.state !== 'open') {
    return { shouldProcess: false, reason: `PR state is ${pr.state}, not open` };
  }

  // Skip draft PRs
  if (pr.draft) {
    return { shouldProcess: false, reason: 'PR is a draft' };
  }

  // Check if I was the one requested
  // GitHub sends "requested_reviewer" in the event payload
  if (event.requested_reviewer?.login !== myUsername) {
    return {
      shouldProcess: false,
      reason: `Requested reviewer is ${event.requested_reviewer?.login}, not ${myUsername}`,
    };
  }

  return {
    shouldProcess: true,
    reason: `${myUsername} was requested as reviewer`,
    mergeRequestNumber: pr.number,
    projectPath: event.repository.full_name,
    mergeRequestUrl: pr.html_url,
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
  };
}

/**
 * Check if a GitHub PR was closed (not merged)
 * Returns info to clean up tracking
 */
export function filterGitHubPrClose(event: GitHubPullRequestEvent): FilterResult {
  const pr = event.pull_request;

  // Check if action is "closed"
  if (event.action !== 'closed') {
    return { shouldProcess: false, reason: `Action is ${event.action}, not closed` };
  }

  // Verify state is closed
  if (pr.state !== 'closed') {
    return { shouldProcess: false, reason: `State is ${pr.state}, not closed` };
  }

  return {
    shouldProcess: true,
    reason: 'PR was closed',
    mergeRequestNumber: pr.number,
    projectPath: event.repository.full_name,
    mergeRequestUrl: pr.html_url,
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
  };
}

/**
 * Filter GitHub PR label events
 * Returns true if the "needs-review" label was added
 */
export function filterGitHubLabelEvent(event: GitHubPullRequestEvent): FilterResult {
  // Check event action
  if (event.action !== 'labeled') {
    return { shouldProcess: false, reason: `Action is ${event.action}, not labeled` };
  }

  const pr = event.pull_request;

  // PR must be open
  if (pr.state !== 'open') {
    return { shouldProcess: false, reason: `PR state is ${pr.state}, not open` };
  }

  // Skip draft PRs
  if (pr.draft) {
    return { shouldProcess: false, reason: 'PR is a draft' };
  }

  // Check if the added label is our trigger label
  if (event.label?.name !== REVIEW_TRIGGER_LABEL) {
    return {
      shouldProcess: false,
      reason: `Label "${event.label?.name}" is not "${REVIEW_TRIGGER_LABEL}"`,
    };
  }

  return {
    shouldProcess: true,
    reason: `Label "${REVIEW_TRIGGER_LABEL}" was added`,
    mergeRequestNumber: pr.number,
    projectPath: event.repository.full_name,
    mergeRequestUrl: pr.html_url,
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
  };
}
