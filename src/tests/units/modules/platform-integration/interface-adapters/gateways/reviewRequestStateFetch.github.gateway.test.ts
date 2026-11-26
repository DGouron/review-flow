import { describe, expect, it } from 'vitest';

import { GitHubReviewRequestStateFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/reviewRequestStateFetch.github.gateway.js';

function executorReturning(output: string): {
  executor: (command: string, args: string[]) => string;
  calls: Array<{ command: string; args: string[] }>;
} {
  const calls: Array<{ command: string; args: string[] }> = [];
  return {
    calls,
    executor: (command, args) => {
      calls.push({ command, args });
      return output;
    },
  };
}

describe('GitHubReviewRequestStateFetchGateway', () => {
  describe('listOpenNumbers', () => {
    it('returns the numbers of the open pull requests of the repository', () => {
      const { executor } = executorReturning('[{"number":1536},{"number":2001}]');
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      expect(gateway.listOpenNumbers('acme/app')).toEqual([1536, 2001]);
    });

    it('asks gh for the open pull requests of the given repository without a shell', () => {
      const { executor, calls } = executorReturning('[]');
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      gateway.listOpenNumbers('acme/app');

      expect(calls).toEqual([
        {
          command: 'gh',
          args: [
            'pr',
            'list',
            '--repo',
            'acme/app',
            '--state',
            'open',
            '--json',
            'number',
            '--limit',
            '1000',
          ],
        },
      ]);
    });

    it('rejects an unexpected gh output', () => {
      const { executor } = executorReturning('{"message":"Not Found"}');
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      expect(() => gateway.listOpenNumbers('acme/app')).toThrow(/githubOpenPullRequests/);
    });
  });

  describe('fetchState', () => {
    it.each([
      ['OPEN', 'open'],
      ['CLOSED', 'closed'],
      ['MERGED', 'merged'],
    ] as const)('maps the GitHub state %s to %s', (githubState, expected) => {
      const { executor } = executorReturning(`{"state":"${githubState}"}`);
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      expect(gateway.fetchState('acme/app', 1924)).toBe(expected);
    });

    it('asks gh for the state of the given pull request', () => {
      const { executor, calls } = executorReturning('{"state":"MERGED"}');
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      gateway.fetchState('acme/app', 1924);

      expect(calls).toEqual([
        {
          command: 'gh',
          args: ['pr', 'view', '1924', '--repo', 'acme/app', '--json', 'state'],
        },
      ]);
    });
  });
});
