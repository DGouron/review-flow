import { describe, it, expect, vi } from 'vitest';
import { isProcessRunning } from '../../../../shared/services/processChecker.js';

describe('isProcessRunning', () => {
  it('should return true when kill(pid, 0) succeeds', () => {
    const kill = vi.fn();

    const result = isProcessRunning(1234, kill);

    expect(result).toBe(true);
    expect(kill).toHaveBeenCalledWith(1234, 0);
  });

  it('should return false when kill(pid, 0) throws', () => {
    const kill = vi.fn(() => {
      throw new Error('ESRCH');
    });

    const result = isProcessRunning(1234, kill);

    expect(result).toBe(false);
  });
});
