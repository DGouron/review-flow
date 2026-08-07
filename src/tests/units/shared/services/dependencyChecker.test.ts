import { describe, it, expect } from 'vitest';

import {
  checkDependency,
  validateDependencies,
} from '../../../../shared/services/dependencyChecker.js';

function executorMissing(...absentCommands: string[]) {
  return (command: string) => {
    if (absentCommands.some((absent) => command.startsWith(absent))) {
      throw new Error('command not found');
    }
    return Buffer.from('1.0.0');
  };
}

describe('dependencyChecker', () => {
  describe('checkDependency', () => {
    it('should return true when command succeeds', () => {
      const fakeExecutor = () => Buffer.from('1.0.0');

      const result = checkDependency({ name: 'test', command: 'test --version' }, fakeExecutor);

      expect(result).toBe(true);
    });

    it('should return false when command fails', () => {
      const fakeExecutor = () => {
        throw new Error('command not found');
      };

      const result = checkDependency({ name: 'fake', command: 'fake --version' }, fakeExecutor);

      expect(result).toBe(false);
    });
  });

  describe('validateDependencies', () => {
    it('should not require glab when only github repositories are configured', () => {
      const result = validateDependencies(['github'], executorMissing('glab'));

      expect(result).toEqual([]);
    });

    it('should not require gh when only gitlab repositories are configured', () => {
      const result = validateDependencies(['gitlab'], executorMissing('gh '));

      expect(result).toEqual([]);
    });

    it('should require gh when a github repository is configured', () => {
      const result = validateDependencies(['github'], executorMissing('gh '));

      expect(result.map((dependency) => dependency.name)).toEqual(['GitHub CLI (gh)']);
    });

    it('should require glab when a gitlab repository is configured', () => {
      const result = validateDependencies(['gitlab'], executorMissing('glab'));

      expect(result.map((dependency) => dependency.name)).toEqual(['GitLab CLI (glab)']);
    });

    it('should require both platform CLIs when both platforms are configured', () => {
      const result = validateDependencies(['github', 'gitlab'], executorMissing('gh ', 'glab'));

      expect(result.map((dependency) => dependency.name)).toEqual([
        'GitLab CLI (glab)',
        'GitHub CLI (gh)',
      ]);
    });

    it('should always require the Claude Code CLI, whatever the platforms', () => {
      const result = validateDependencies([], executorMissing('claude'));

      expect(result.map((dependency) => dependency.name)).toEqual(['Claude Code CLI']);
    });

    it('should require no platform CLI when no repository is configured', () => {
      const result = validateDependencies([], executorMissing('glab', 'gh '));

      expect(result).toEqual([]);
    });

    it('should return the install url of each missing dependency', () => {
      const result = validateDependencies(['github'], executorMissing('gh '));

      expect(result[0]).toHaveProperty('installUrl');
    });

    it('should return empty array when all required dependencies are found', () => {
      const result = validateDependencies(['github', 'gitlab'], () => Buffer.from('1.0.0'));

      expect(result).toEqual([]);
    });
  });
});
