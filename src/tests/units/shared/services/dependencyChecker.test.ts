import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDependency, validateDependencies } from '../../../../shared/services/dependencyChecker.js';
import { execSync } from 'node:child_process';

vi.mock('node:child_process');

describe('dependencyChecker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('checkDependency', () => {
    it('should return true when command succeeds', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('1.0.0'));

      const result = checkDependency({ name: 'test', command: 'test --version' });

      expect(result).toBe(true);
    });

    it('should return false when command fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = checkDependency({ name: 'fake', command: 'fake --version' });

      expect(result).toBe(false);
    });
  });

  describe('validateDependencies', () => {
    it('should return missing dependencies', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const result = validateDependencies();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('installUrl');
    });

    it('should return empty array when all dependencies found', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('1.0.0'));

      const result = validateDependencies();

      expect(result).toEqual([]);
    });
  });
});
