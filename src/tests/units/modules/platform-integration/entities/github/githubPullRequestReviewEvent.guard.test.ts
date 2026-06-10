import { describe, it, expect } from 'vitest';

import { gitHubPullRequestReviewEventGuard } from '@/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.js';

function validPayload(): unknown {
  return {
    action: 'submitted',
    review: {
      id: 12345,
      state: 'approved',
      user: { login: 'alice' },
    },
    pull_request: {
      number: 42,
      state: 'open',
      html_url: 'https://github.com/test-owner/test-repo/pull/42',
    },
    repository: {
      full_name: 'test-owner/test-repo',
      html_url: 'https://github.com/test-owner/test-repo',
      clone_url: 'https://github.com/test-owner/test-repo.git',
    },
    sender: { login: 'alice' },
  };
}

describe('gitHubPullRequestReviewEventGuard', () => {
  it('accepts a valid approved review payload', () => {
    const result = gitHubPullRequestReviewEventGuard.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing the review.id', () => {
    const base = validPayload() as {
      review: { id?: number; state: string; user: { login: string } };
    };
    const payload = {
      ...base,
      review: { state: base.review.state, user: base.review.user },
    };
    const result = gitHubPullRequestReviewEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing pull_request.number', () => {
    const base = validPayload() as { pull_request: { number?: number } };
    const payload = { ...base, pull_request: {} };
    const result = gitHubPullRequestReviewEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing the review.state', () => {
    const base = validPayload() as {
      review: { id: number; state?: string; user: { login: string } };
    };
    const payload = {
      ...base,
      review: { id: base.review.id, user: base.review.user },
    };
    const result = gitHubPullRequestReviewEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
