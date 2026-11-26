import { describe, expect, it } from 'vitest';

import { GitHubReviewRequestOverviewFetchGateway } from '@/modules/review-brief/interface-adapters/gateways/reviewRequestOverview.github.gateway.js';
import { GitHubApiResponseFactory } from '@/tests/factories/githubApiResponse.factory.js';

describe('GitHubReviewRequestOverviewFetchGateway', () => {
  it('reads the title, description and head sha of the pull request', () => {
    const gateway = new GitHubReviewRequestOverviewFetchGateway(() =>
      GitHubApiResponseFactory.createPullRequestOverviewResponse({
        title: 'Add VAT',
        body: 'VAT per line',
        headSha: 'abc123',
      }),
    );

    expect(gateway.fetchOverview('owner/repo', 42)).toEqual({
      title: 'Add VAT',
      description: 'VAT per line',
      headSha: 'abc123',
    });
  });

  it('reads an empty description when the pull request has no body', () => {
    const gateway = new GitHubReviewRequestOverviewFetchGateway(() =>
      GitHubApiResponseFactory.createPullRequestOverviewResponse({ body: null }),
    );

    expect(gateway.fetchOverview('owner/repo', 42)?.description).toBe('');
  });

  it('calls the read-only pulls endpoint without a shell', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const gateway = new GitHubReviewRequestOverviewFetchGateway((command, args) => {
      calls.push({ command, args });
      return GitHubApiResponseFactory.createPullRequestOverviewResponse();
    });

    gateway.fetchOverview('owner/repo', 42);

    expect(calls).toEqual([{ command: 'gh', args: ['api', 'repos/owner/repo/pulls/42'] }]);
  });

  it('returns null when the executor throws', () => {
    const gateway = new GitHubReviewRequestOverviewFetchGateway(() => {
      throw new Error('Network error');
    });

    expect(gateway.fetchOverview('owner/repo', 42)).toBeNull();
  });

  it('returns null when the response is not JSON', () => {
    const gateway = new GitHubReviewRequestOverviewFetchGateway(() => 'not json');

    expect(gateway.fetchOverview('owner/repo', 42)).toBeNull();
  });

  it('returns null when the response has no head sha', () => {
    const gateway = new GitHubReviewRequestOverviewFetchGateway(() =>
      JSON.stringify({ title: 'Add VAT', body: null }),
    );

    expect(gateway.fetchOverview('owner/repo', 42)).toBeNull();
  });
});
