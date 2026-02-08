import { describe, it, expect } from 'vitest';
import {
  checkDependency,
  validateDependencies,
} from '../../../../shared/services/dependencyChecker.js';

describe('dependencyChecker', () => {
  describe('checkDependency', () => {
    it('should return true when command succeeds', () => {
      const fakeExecutor = () => Buffer.from('1.0.0');

      const result = checkDependency(
        { name: 'test', command: 'test --version' },
        fakeExecutor,
      );

      expect(result).toBe(true);
    });

    it('should return false when command fails', () => {
      const fakeExecutor = () => {
        throw new Error('command not found');
      };

      const result = checkDependency(
        { name: 'fake', command: 'fake --version' },
        fakeExecutor,
      );

      expect(result).toBe(false);
    });
  });

  describe('validateDependencies', () => {
    it('should return missing dependencies when commands fail', () => {
      const fakeExecutor = () => {
        throw new Error('not found');
      };

      const result = validateDependencies(fakeExecutor);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('installUrl');
    });

    it('should return empty array when all dependencies found', () => {
      const fakeExecutor = () => Buffer.from('1.0.0');

      const result = validateDependencies(fakeExecutor);

      expect(result).toEqual([]);
    });
  });
});
