import { describe, it, expect } from 'vitest';

import {
  parseReviewRequest,
  safeParseReviewRequest,
  isValidReviewRequest,
} from '@/modules/review-execution/entities/reviewRequest/reviewRequest.guard.js';

const validReviewRequest = {
  platform: 'gitlab',
  projectPath: 'group/project',
  reviewRequestNumber: 42,
  title: 'Add feature',
  sourceBranch: 'feat/x',
  targetBranch: 'main',
  state: 'open',
  isDraft: false,
  author: 'alice',
  webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
  createdAt: '2026-05-30T10:00:00Z',
  updatedAt: '2026-05-30T11:00:00Z',
};

describe('reviewRequest.guard', () => {
  it('parses a valid review request', () => {
    const result = parseReviewRequest(validReviewRequest);
    expect(result.reviewRequestNumber).toBe(42);
  });

  it('throws when parsing an invalid review request', () => {
    expect(() => parseReviewRequest({ ...validReviewRequest, reviewRequestNumber: -1 })).toThrow();
  });

  it('safeParse succeeds on a valid request and fails on a bad url', () => {
    expect(safeParseReviewRequest(validReviewRequest).success).toBe(true);
    expect(safeParseReviewRequest({ ...validReviewRequest, webUrl: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('isValid reflects validity', () => {
    expect(isValidReviewRequest(validReviewRequest)).toBe(true);
    expect(isValidReviewRequest({ platform: 'bitbucket' })).toBe(false);
  });
});
