import { describe, it, expect } from 'vitest';

import { GitLabThreadFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

import { GitLabApiResponseFactory } from '../../../factories/gitlabApiResponse.factory.js';

describe('GitLabThreadFetchGateway', () => {
  describe('fetchThreads', () => {
    it('should fetch threads with full metadata from GitLab API', () => {
      const stubExecutor = () =>
        GitLabApiResponseFactory.createDiscussionsResponse([
          {
            id: 'abc123def',
            notes: [
              {
                resolvable: true,
                resolved: false,
                body: 'Missing validation',
                position: {
                  new_path: 'src/services/service.ts',
                  new_line: 42,
                },
              },
            ],
          },
        ]);

      const gateway = new GitLabThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('group/project', 99);

      expect(threads).toHaveLength(1);
      expect(threads[0].id).toBe('abc123def');
      expect(threads[0].file).toBe('src/services/service.ts');
      expect(threads[0].line).toBe(42);
      expect(threads[0].status).toBe('open');
    });

    it('should carry every note of the discussion as a comment, oldest first', () => {
      const stubExecutor = () =>
        GitLabApiResponseFactory.createDiscussionsResponse([
          {
            id: 'conversation1',
            notes: [
              {
                resolvable: true,
                resolved: false,
                body: 'Missing validation',
                position: { new_path: 'src/services/service.ts', new_line: 42 },
                author: { username: 'maintainer' },
                created_at: '2026-08-01T10:00:00Z',
              },
              {
                resolvable: true,
                resolved: false,
                body: 'Validated upstream by the guard',
                position: null,
                author: { username: 'author' },
                created_at: '2026-08-01T11:00:00Z',
              },
              {
                resolvable: true,
                resolved: false,
                body: 'Right, withdrawing it',
                position: null,
                author: { username: 'maintainer' },
                created_at: '2026-08-01T12:00:00Z',
              },
            ],
          },
        ]);

      const gateway = new GitLabThreadFetchGateway(stubExecutor);
      const threads = gateway.fetchThreads('group/project', 99);

      expect(threads[0].body).toBe('Missing validation');
      expect(threads[0].comments).toEqual([
        { author: 'maintainer', body: 'Missing validation', createdAt: '2026-08-01T10:00:00Z' },
        {
          author: 'author',
          body: 'Validated upstream by the guard',
          createdAt: '2026-08-01T11:00:00Z',
        },
        { author: 'maintainer', body: 'Right, withdrawing it', createdAt: '2026-08-01T12:00:00Z' },
      ]);
    });

    it('should skip a discussion whose first note is not resolvable', () => {
      const stubExecutor = () =>
        GitLabApiResponseFactory.createDiscussionsResponse([
          {
            id: 'system1',
            notes: [
              {
                resolvable: false,
                resolved: false,
                body: 'changed the description',
                position: null,
              },
            ],
          },
        ]);

      const gateway = new GitLabThreadFetchGateway(stubExecutor);

      expect(gateway.fetchThreads('group/project', 99)).toEqual([]);
    });

    it('should hand the API path to the executor as a single argument, with no shell', () => {
      const calls: Array<{ command: string; args: string[] }> = [];
      const stubExecutor = (command: string, args: string[]) => {
        calls.push({ command, args });
        return GitLabApiResponseFactory.createDiscussionsResponse([]);
      };

      const gateway = new GitLabThreadFetchGateway(stubExecutor);
      gateway.fetchThreads("group/proj'; touch pwned; #", 99);

      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('glab');
      expect(calls[0].args).toEqual([
        'api',
        "projects/group%2Fproj'; touch pwned; #/merge_requests/99/discussions",
      ]);
    });
  });
});
