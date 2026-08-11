import { describe, it, expect } from 'vitest';

import { GitHubThreadFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';

import { GitHubApiResponseFactory } from '../../../factories/githubApiResponse.factory.js';

describe('GitHubThreadFetchGateway', () => {
  describe('fetchThreads', () => {
    it('should fetch threads with full metadata from GitHub API', () => {
      const stubExecutor = () =>
        GitHubApiResponseFactory.createReviewThreadsResponse([
          {
            id: 'PRRT_kwDONxxx123',
            isResolved: false,
            path: 'src/services/mrTrackingService.ts',
            line: 320,
            body: 'Missing test for threadsOpened',
          },
        ]);

      const gateway = new GitHubThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('owner/repo', 42);

      expect(threads).toHaveLength(1);
      expect(threads[0].id).toBe('PRRT_kwDONxxx123');
      expect(threads[0].file).toBe('src/services/mrTrackingService.ts');
      expect(threads[0].line).toBe(320);
      expect(threads[0].status).toBe('open');
      expect(threads[0].body).toBe('Missing test for threadsOpened');
    });

    it('should mark resolved threads with status resolved', () => {
      const stubExecutor = () =>
        GitHubApiResponseFactory.createReviewThreadsResponse([
          {
            id: 'PRRT_resolved',
            isResolved: true,
            path: 'src/file.ts',
            line: 10,
            body: 'Fixed issue',
          },
        ]);

      const gateway = new GitHubThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('owner/repo', 42);

      expect(threads[0].status).toBe('resolved');
    });

    it('should carry the whole conversation oldest first, opener at index 0', () => {
      const stubExecutor = () =>
        GitHubApiResponseFactory.createReviewThreadsResponse([
          {
            id: 'PRRT_conversation',
            isResolved: false,
            path: 'src/file.ts',
            line: 12,
            body: 'Nullable access not guarded',
            comments: [
              {
                author: 'maintainer',
                body: 'Nullable access not guarded',
                createdAt: '2026-08-01T10:00:00Z',
              },
              {
                author: 'maintainer',
                body: 'Intentional, the gateway already guarantees non-null',
                createdAt: '2026-08-01T11:30:00Z',
              },
              { author: 'maintainer', body: 'Fixed in abc1234', createdAt: '2026-08-02T09:00:00Z' },
            ],
          },
        ]);

      const gateway = new GitHubThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('owner/repo', 42);

      expect(threads[0].body).toBe('Nullable access not guarded');
      expect(threads[0].comments).toEqual([
        {
          author: 'maintainer',
          body: 'Nullable access not guarded',
          createdAt: '2026-08-01T10:00:00Z',
        },
        {
          author: 'maintainer',
          body: 'Intentional, the gateway already guarantees non-null',
          createdAt: '2026-08-01T11:30:00Z',
        },
        { author: 'maintainer', body: 'Fixed in abc1234', createdAt: '2026-08-02T09:00:00Z' },
      ]);
    });

    it('should keep a null author when the GitHub account is gone', () => {
      const stubExecutor = () =>
        GitHubApiResponseFactory.createReviewThreadsResponse([
          {
            id: 'PRRT_deleted_author',
            isResolved: false,
            path: 'src/file.ts',
            line: 3,
            body: 'Finding',
            comments: [
              { author: 'maintainer', body: 'Finding', createdAt: '2026-08-01T10:00:00Z' },
              {
                author: null,
                body: 'Reply from a deleted account',
                createdAt: '2026-08-01T12:00:00Z',
              },
            ],
          },
        ]);

      const gateway = new GitHubThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('owner/repo', 42);

      expect(threads[0].comments?.[1]).toEqual({
        author: null,
        body: 'Reply from a deleted account',
        createdAt: '2026-08-01T12:00:00Z',
      });
    });

    it('should expose a single-comment thread as a one-entry conversation', () => {
      const stubExecutor = () =>
        GitHubApiResponseFactory.createReviewThreadsResponse([
          {
            id: 'PRRT_single',
            isResolved: false,
            path: 'src/file.ts',
            line: 7,
            body: 'Only the finding',
          },
        ]);

      const gateway = new GitHubThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('owner/repo', 42);

      expect(threads[0].comments).toHaveLength(1);
      expect(threads[0].comments?.[0].body).toBe('Only the finding');
    });

    it('should pass owner, name and number as GraphQL variables, never inside the query string', () => {
      const calls: Array<{ command: string; args: string[] }> = [];
      const stubExecutor = (command: string, args: string[]) => {
        calls.push({ command, args });
        return GitHubApiResponseFactory.createReviewThreadsResponse([]);
      };

      const gateway = new GitHubThreadFetchGateway(stubExecutor);
      gateway.fetchThreads("owner'; touch pwned; #/repo", 42);

      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('gh');
      expect(calls[0].args).toContain("owner=owner'; touch pwned; #");
      expect(calls[0].args).toContain('name=repo');
      expect(calls[0].args).toContain('number=42');

      const query = calls[0].args.find((argument) => argument.startsWith('query='));
      expect(query).toBeDefined();
      expect(query).not.toContain('touch pwned');
    });
  });
});
