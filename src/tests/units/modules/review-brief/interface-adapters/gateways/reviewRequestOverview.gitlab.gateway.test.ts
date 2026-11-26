import { describe, expect, it } from 'vitest';

import { GitLabReviewRequestOverviewFetchGateway } from '@/modules/review-brief/interface-adapters/gateways/reviewRequestOverview.gitlab.gateway.js';
import { GitLabApiResponseFactory } from '@/tests/factories/gitlabApiResponse.factory.js';

describe('GitLabReviewRequestOverviewFetchGateway', () => {
  it('reads the title, description and head sha of the merge request', () => {
    const gateway = new GitLabReviewRequestOverviewFetchGateway(() =>
      GitLabApiResponseFactory.createMergeRequestResponse({
        title: 'Add VAT',
        description: 'VAT per line',
        sha: 'abc123',
      }),
    );

    expect(gateway.fetchOverview('group/project', 7)).toEqual({
      title: 'Add VAT',
      description: 'VAT per line',
      headSha: 'abc123',
    });
  });

  it('reads an empty description when the merge request has none', () => {
    const gateway = new GitLabReviewRequestOverviewFetchGateway(() =>
      GitLabApiResponseFactory.createMergeRequestResponse({ description: null }),
    );

    expect(gateway.fetchOverview('group/project', 7)?.description).toBe('');
  });

  it('calls the read-only merge request endpoint with an encoded project path, without a shell', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const gateway = new GitLabReviewRequestOverviewFetchGateway((command, args) => {
      calls.push({ command, args });
      return GitLabApiResponseFactory.createMergeRequestResponse();
    });

    gateway.fetchOverview('group/sub/project', 7);

    expect(calls).toEqual([
      { command: 'glab', args: ['api', 'projects/group%2Fsub%2Fproject/merge_requests/7'] },
    ]);
  });

  it('returns null when the executor throws', () => {
    const gateway = new GitLabReviewRequestOverviewFetchGateway(() => {
      throw new Error('Network error');
    });

    expect(gateway.fetchOverview('group/project', 7)).toBeNull();
  });

  it('returns null when the response has no sha', () => {
    const gateway = new GitLabReviewRequestOverviewFetchGateway(() =>
      JSON.stringify({ title: 'Add VAT', description: null }),
    );

    expect(gateway.fetchOverview('group/project', 7)).toBeNull();
  });
});
