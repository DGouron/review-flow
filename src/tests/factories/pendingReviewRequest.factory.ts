import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';

export const PendingReviewRequestFactory = {
  create(overrides: Partial<PendingReviewRequest> = {}): PendingReviewRequest {
    return {
      pendingReviewRequestId: 'pending-gitlab-group-project-42',
      job: {
        id: 'gitlab:group/project:42',
        platform: 'gitlab',
        projectPath: 'group/project',
        localPath: '/home/user/projects/test',
        mrNumber: 42,
        skill: 'review-code',
        mrUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
        sourceBranch: 'feature/x',
        targetBranch: 'main',
        jobType: 'review',
      },
      jobType: 'review',
      platform: 'gitlab',
      triggerSource: 'webhook-initial',
      createdAt: '2026-05-23T10:00:00.000Z',
      ...overrides,
    };
  },

  github(overrides: Partial<PendingReviewRequest> = {}): PendingReviewRequest {
    return {
      pendingReviewRequestId: 'pending-github-owner-repo-7',
      job: {
        id: 'github:owner/repo:7',
        platform: 'github',
        projectPath: 'owner/repo',
        localPath: '/home/user/projects/github-test',
        mrNumber: 7,
        skill: 'review-code',
        mrUrl: 'https://github.com/owner/repo/pull/7',
        sourceBranch: 'feature/y',
        targetBranch: 'main',
        jobType: 'review',
      },
      jobType: 'review',
      platform: 'github',
      triggerSource: 'webhook-initial',
      createdAt: '2026-05-23T10:00:00.000Z',
      ...overrides,
    };
  },
};
