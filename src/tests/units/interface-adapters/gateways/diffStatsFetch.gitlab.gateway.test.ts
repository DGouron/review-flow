import { describe, it, expect } from 'vitest';

import { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';

function graphqlEnvelope(diffStatsSummary: unknown): string {
  return JSON.stringify({ data: { project: { mergeRequest: { diffStatsSummary } } } });
}

describe('GitLabDiffStatsFetchGateway', () => {
  describe('fetchDiffStats', () => {
    it('should read additions/deletions from GraphQL diff summary and count commits', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }, { id: 'commit2' }, { id: 'commit3' }]);
        }
        return graphqlEnvelope({ additions: 629, deletions: 3, fileCount: 11 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 5444);

      expect(result).toEqual({ commitsCount: 3, additions: 629, deletions: 3 });
    });

    it('should emit a GraphQL query with the raw project fullPath and merge request iid', () => {
      const capturedCommands: string[] = [];
      const stubExecutor = (command: string) => {
        capturedCommands.push(command);
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return graphqlEnvelope({ additions: 0, deletions: 0, fileCount: 0 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      gateway.fetchDiffStats('group/project', 99);

      const graphqlCommand = capturedCommands.find((command) => command.includes('graphql'));
      expect(graphqlCommand).toBeDefined();
      expect(graphqlCommand).toContain('fullPath:"group/project"');
      expect(graphqlCommand).toContain('iid:"99"');
    });

    it('should encode the project path for the REST commits call', () => {
      const capturedCommands: string[] = [];
      const stubExecutor = (command: string) => {
        capturedCommands.push(command);
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return graphqlEnvelope({ additions: 0, deletions: 0, fileCount: 0 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      gateway.fetchDiffStats('group/project', 99);

      const commitsCommand = capturedCommands.find((command) => command.includes('/commits'));
      expect(commitsCommand).toContain('group%2Fproject');
      expect(commitsCommand).toContain('merge_requests/99/commits');
    });

    it('should throw when the project is missing from the GraphQL response', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return JSON.stringify({ data: { project: null } });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);

      expect(() => gateway.fetchDiffStats('group/project', 42)).toThrow();
    });

    it('should throw when the merge request is missing from the GraphQL response', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return JSON.stringify({ data: { project: { mergeRequest: null } } });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);

      expect(() => gateway.fetchDiffStats('group/project', 42)).toThrow();
    });

    it('should throw when the diff summary is missing from the GraphQL response', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return JSON.stringify({ data: { project: { mergeRequest: { diffStatsSummary: null } } } });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);

      expect(() => gateway.fetchDiffStats('group/project', 42)).toThrow();
    });

    it('should throw when the GraphQL call throws', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('graphql')) {
          throw new Error('GraphQL API error');
        }
        return JSON.stringify([{ id: 'commit1' }]);
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);

      expect(() => gateway.fetchDiffStats('group/project', 42)).toThrow();
    });

    it('should throw when the commits call throws', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          throw new Error('Commits API error');
        }
        return graphqlEnvelope({ additions: 10, deletions: 5, fileCount: 2 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);

      expect(() => gateway.fetchDiffStats('group/project', 42)).toThrow();
    });

    it('should throw when the GraphQL response is malformed JSON', () => {
      const stubExecutor = () => 'not valid json';

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);

      expect(() => gateway.fetchDiffStats('group/project', 42)).toThrow();
    });

    it('should return zero additions and deletions without throwing', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return graphqlEnvelope({ additions: 0, deletions: 0, fileCount: 0 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 10);

      expect(result).toEqual({ commitsCount: 1, additions: 0, deletions: 0 });
    });

    it('should count zero commits when the commits array is empty', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([]);
        }
        return graphqlEnvelope({ additions: 10, deletions: 5, fileCount: 1 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 42);

      expect(result?.commitsCount).toBe(0);
    });
  });
});
