import { describe, it, expect, vi } from 'vitest';

import {
  checkInitPrerequisites,
  type CheckInitPrerequisitesDependencies,
} from '@/modules/cli-configuration/usecases/cli/checkInitPrerequisites.js';

function createFakeDeps(
  overrides?: Partial<CheckInitPrerequisitesDependencies>,
): CheckInitPrerequisitesDependencies {
  return {
    executeCommand: vi.fn(() => ''),
    getNodeMajorVersion: vi.fn(() => 22),
    ...overrides,
  };
}

describe('checkInitPrerequisites', () => {
  it('should return ok when Node >= 20 and Claude CLI is installed', () => {
    const deps = createFakeDeps();

    const result = checkInitPrerequisites(deps);

    expect(result).toEqual({ status: 'ok' });
  });

  it('should return node-version-too-low when Node < 20', () => {
    const deps = createFakeDeps({
      getNodeMajorVersion: vi.fn(() => 18),
    });

    const result = checkInitPrerequisites(deps);

    expect(result).toEqual({
      status: 'node-version-too-low',
      found: 18,
      required: 20,
    });
  });

  it('should return claude-not-installed when claude --version throws', () => {
    const deps = createFakeDeps({
      executeCommand: vi.fn(() => {
        throw new Error('command not found');
      }),
    });

    const result = checkInitPrerequisites(deps);

    expect(result).toEqual({
      status: 'claude-not-installed',
      installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    });
  });

  it('should check Node version before Claude CLI', () => {
    const deps = createFakeDeps({
      getNodeMajorVersion: vi.fn(() => 16),
      executeCommand: vi.fn(() => {
        throw new Error('not found');
      }),
    });

    const result = checkInitPrerequisites(deps);

    expect(result.status).toBe('node-version-too-low');
  });

  it('should accept Node version exactly 20', () => {
    const deps = createFakeDeps({
      getNodeMajorVersion: vi.fn(() => 20),
    });

    const result = checkInitPrerequisites(deps);

    expect(result).toEqual({ status: 'ok' });
  });
});
