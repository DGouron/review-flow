import { describe, it, expect } from 'vitest';

import { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';

describe('GitLabDiffStatsFetchGateway', () => {
  describe('fetchDiffStats', () => {
    it('should parse additions, deletions from MR API and count commits', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }, { id: 'commit2' }, { id: 'commit3' }]);
        }
        return JSON.stringify({
          changes_count: '5',
          additions: 150,
          deletions: 30,
        });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 42);

      expect(result).not.toBeNull();
      expect(result?.additions).toBe(150);
      expect(result?.deletions).toBe(30);
      expect(result?.commitsCount).toBe(3);
    });

    it('should encode project path for API URL', () => {
      const capturedCommands: string[] = [];
      const stubExecutor = (command: string) => {
        capturedCommands.push(command);
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return JSON.stringify({ additions: 0, deletions: 0 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      gateway.fetchDiffStats('group/project', 99);

      expect(capturedCommands[0]).toContain('group%2Fproject');
      expect(capturedCommands[0]).toContain('merge_requests/99');
    });

    it('should return null when MR API call throws', () => {
      const stubExecutor = () => {
        throw new Error('API error');
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 42);

      expect(result).toBeNull();
    });

    it('should return null when commits API call throws', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          throw new Error('Commits API error');
        }
        return JSON.stringify({ additions: 10, deletions: 5 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 42);

      expect(result).toBeNull();
    });

    it('should return null when MR response is malformed', () => {
      const stubExecutor = () => 'not valid json';

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 42);

      expect(result).toBeNull();
    });

    it('should handle MR with zero additions and deletions', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'commit1' }]);
        }
        return JSON.stringify({ additions: 0, deletions: 0 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 10);

      expect(result).not.toBeNull();
      expect(result?.additions).toBe(0);
      expect(result?.deletions).toBe(0);
      expect(result?.commitsCount).toBe(1);
    });

    it('should handle empty commits array', () => {
      const stubExecutor = (command: string) => {
        if (command.includes('/commits')) {
          return JSON.stringify([]);
        }
        return JSON.stringify({ additions: 10, deletions: 5 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('group/project', 42);

      expect(result).not.toBeNull();
      expect(result?.commitsCount).toBe(0);
    });
  });
});
