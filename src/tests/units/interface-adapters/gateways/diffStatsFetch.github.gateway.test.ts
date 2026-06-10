import { describe, it, expect } from 'vitest';

import { GitHubDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.js';

describe('GitHubDiffStatsFetchGateway', () => {
  describe('fetchDiffStats', () => {
    it('should parse additions, deletions, and commits from GitHub PR API', () => {
      const stubExecutor = () =>
        JSON.stringify({
          additions: 150,
          deletions: 30,
          commits: 3,
        });

      const gateway = new GitHubDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('owner/repo', 42);

      expect(result).not.toBeNull();
      expect(result?.additions).toBe(150);
      expect(result?.deletions).toBe(30);
      expect(result?.commitsCount).toBe(3);
    });

    it('should call the correct GitHub API endpoint', () => {
      let capturedCommand = '';
      const stubExecutor = (command: string) => {
        capturedCommand = command;
        return JSON.stringify({ additions: 0, deletions: 0, commits: 0 });
      };

      const gateway = new GitHubDiffStatsFetchGateway(stubExecutor);
      gateway.fetchDiffStats('owner/repo', 42);

      expect(capturedCommand).toContain('repos/owner/repo/pulls/42');
    });

    it('should return null when executor throws an error', () => {
      const stubExecutor = () => {
        throw new Error('Network error');
      };

      const gateway = new GitHubDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('owner/repo', 42);

      expect(result).toBeNull();
    });

    it('should return null when response is malformed JSON', () => {
      const stubExecutor = () => 'not valid json';

      const gateway = new GitHubDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('owner/repo', 42);

      expect(result).toBeNull();
    });

    it('should return null when response is missing required fields', () => {
      const stubExecutor = () => JSON.stringify({ base: { sha: 'abc' } });

      const gateway = new GitHubDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('owner/repo', 42);

      expect(result).toBeNull();
    });

    it('should handle zero-diff pull request', () => {
      const stubExecutor = () =>
        JSON.stringify({
          additions: 0,
          deletions: 0,
          commits: 1,
        });

      const gateway = new GitHubDiffStatsFetchGateway(stubExecutor);
      const result = gateway.fetchDiffStats('owner/repo', 10);

      expect(result).not.toBeNull();
      expect(result?.additions).toBe(0);
      expect(result?.deletions).toBe(0);
      expect(result?.commitsCount).toBe(1);
    });
  });
});
