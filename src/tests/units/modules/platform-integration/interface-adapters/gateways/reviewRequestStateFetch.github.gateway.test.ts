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
  describe('listOpen', () => {
    it('returns the open pull requests of the repository with their author', () => {
      const { executor } = executorReturning(
        '[{"number":1536,"author":{"login":"jdoe","name":"Jane Doe"}},{"number":2001,"author":{"login":"rroe","name":"Richard Roe"}}]',
      );
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      expect(gateway.listOpen('acme/app')).toEqual([
        { number: 1536, author: { username: 'jdoe', displayName: 'Jane Doe' } },
        { number: 2001, author: { username: 'rroe', displayName: 'Richard Roe' } },
      ]);
    });

    it('has no display name when the author has no name on GitHub', () => {
      const { executor } = executorReturning(
        '[{"number":1536,"author":{"login":"jdoe","name":""}}]',
      );
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      expect(gateway.listOpen('acme/app')).toEqual([
        { number: 1536, author: { username: 'jdoe', displayName: null } },
      ]);
    });

    it('asks gh for the open pull requests and their author without a shell', () => {
      const { executor, calls } = executorReturning('[]');
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      gateway.listOpen('acme/app');

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
            'number,author',
            '--limit',
            '1000',
          ],
        },
      ]);
    });

    it('rejects an unexpected gh output', () => {
      const { executor } = executorReturning('{"message":"Not Found"}');
      const gateway = new GitHubReviewRequestStateFetchGateway(executor);

      expect(() => gateway.listOpen('acme/app')).toThrow(/githubOpenPullRequests/);
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
