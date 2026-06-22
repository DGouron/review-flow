import { describe, it, expect } from 'vitest';

import { GitHubChangedFilesFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.github.gateway.js';

describe('GitHubChangedFilesFetchGateway', () => {
  describe('fetchChangedFiles', () => {
    it('maps filename to path from the GitHub pulls/files API', () => {
      const stubExecutor = () =>
        JSON.stringify([
          { filename: 'src/a.ts', additions: 50, deletions: 10 },
          { filename: 'yarn.lock', additions: 5000, deletions: 0 },
        ]);

      const gateway = new GitHubChangedFilesFetchGateway(stubExecutor);
      const result = gateway.fetchChangedFiles('owner/repo', 42);

      expect(result).toEqual([
        { path: 'src/a.ts', additions: 50, deletions: 10 },
        { path: 'yarn.lock', additions: 5000, deletions: 0 },
      ]);
    });

    it('calls the paginated files endpoint for the pull request', () => {
      let capturedCommand = '';
      const stubExecutor = (command: string) => {
        capturedCommand = command;
        return JSON.stringify([]);
      };

      const gateway = new GitHubChangedFilesFetchGateway(stubExecutor);
      gateway.fetchChangedFiles('owner/repo', 42);

      expect(capturedCommand).toContain('--paginate');
      expect(capturedCommand).toContain('repos/owner/repo/pulls/42/files');
    });

    it('returns null when the executor throws', () => {
      const gateway = new GitHubChangedFilesFetchGateway(() => {
        throw new Error('Network error');
      });

      expect(gateway.fetchChangedFiles('owner/repo', 42)).toBeNull();
    });

    it('returns null when the response is malformed JSON', () => {
      const gateway = new GitHubChangedFilesFetchGateway(() => 'not valid json');

      expect(gateway.fetchChangedFiles('owner/repo', 42)).toBeNull();
    });

    it('returns null when the response is not an array', () => {
      const gateway = new GitHubChangedFilesFetchGateway(() => JSON.stringify({ message: 'nope' }));

      expect(gateway.fetchChangedFiles('owner/repo', 42)).toBeNull();
    });

    it('returns null when an entry has a non-numeric additions field', () => {
      const gateway = new GitHubChangedFilesFetchGateway(() =>
        JSON.stringify([{ filename: 'src/a.ts', additions: 'lots', deletions: 0 }]),
      );

      expect(gateway.fetchChangedFiles('owner/repo', 42)).toBeNull();
    });

    it('returns an empty list for a pull request with no changed files', () => {
      const gateway = new GitHubChangedFilesFetchGateway(() => JSON.stringify([]));

      expect(gateway.fetchChangedFiles('owner/repo', 42)).toEqual([]);
    });
  });
});
