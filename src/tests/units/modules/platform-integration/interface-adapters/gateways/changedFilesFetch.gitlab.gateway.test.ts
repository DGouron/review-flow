import { describe, it, expect } from 'vitest';

import { GitLabChangedFilesFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.gitlab.gateway.js';

function graphqlEnvelope(diffStats: unknown): string {
  return JSON.stringify({ data: { project: { mergeRequest: { diffStats } } } });
}

describe('GitLabChangedFilesFetchGateway', () => {
  describe('fetchChangedFiles', () => {
    it('parses the per-file diffStats array from the GraphQL response', () => {
      const stubExecutor = () =>
        graphqlEnvelope([
          { path: 'src/a.ts', additions: 50, deletions: 10 },
          { path: 'yarn.lock', additions: 5000, deletions: 0 },
        ]);

      const gateway = new GitLabChangedFilesFetchGateway(stubExecutor);
      const result = gateway.fetchChangedFiles('group/project', 42);

      expect(result).toEqual([
        { path: 'src/a.ts', additions: 50, deletions: 10 },
        { path: 'yarn.lock', additions: 5000, deletions: 0 },
      ]);
    });

    it('emits a GraphQL query with the raw project fullPath and merge request iid', () => {
      let capturedCommand = '';
      const stubExecutor = (command: string) => {
        capturedCommand = command;
        return graphqlEnvelope([]);
      };

      const gateway = new GitLabChangedFilesFetchGateway(stubExecutor);
      gateway.fetchChangedFiles('group/project', 99);

      expect(capturedCommand).toContain('graphql');
      expect(capturedCommand).toContain('fullPath:"group/project"');
      expect(capturedCommand).toContain('iid:"99"');
    });

    it('returns null when the executor throws', () => {
      const stubExecutor = () => {
        throw new Error('GraphQL API error');
      };

      const gateway = new GitLabChangedFilesFetchGateway(stubExecutor);

      expect(gateway.fetchChangedFiles('group/project', 42)).toBeNull();
    });

    it('returns null when the response is malformed JSON', () => {
      const gateway = new GitLabChangedFilesFetchGateway(() => 'not valid json');

      expect(gateway.fetchChangedFiles('group/project', 42)).toBeNull();
    });

    it('returns null when diffStats is missing from the response', () => {
      const gateway = new GitLabChangedFilesFetchGateway(() =>
        JSON.stringify({ data: { project: { mergeRequest: null } } }),
      );

      expect(gateway.fetchChangedFiles('group/project', 42)).toBeNull();
    });

    it('returns null when a diffStats entry has a non-numeric additions field', () => {
      const gateway = new GitLabChangedFilesFetchGateway(() =>
        graphqlEnvelope([{ path: 'src/a.ts', additions: 'lots', deletions: 0 }]),
      );

      expect(gateway.fetchChangedFiles('group/project', 42)).toBeNull();
    });

    it('returns an empty list for a merge request with no changed files', () => {
      const gateway = new GitLabChangedFilesFetchGateway(() => graphqlEnvelope([]));

      expect(gateway.fetchChangedFiles('group/project', 42)).toEqual([]);
    });
  });
});
