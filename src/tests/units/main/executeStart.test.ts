import { describe, it, expect, vi } from 'vitest';
import { executeStart, type StartDependencies } from '../../../main/cli.js';

function createFakeDeps(
  overrides: Partial<StartDependencies> = {},
): StartDependencies {
  return {
    validateDependencies: () => [],
    startServer: () => Promise.resolve(),
    exit: vi.fn(),
    error: vi.fn(),
    ...overrides,
  };
}

describe('executeStart', () => {
  it('should call exit(1) when dependencies are missing', () => {
    const deps = createFakeDeps({
      validateDependencies: () => [
        { name: 'Claude CLI', installUrl: 'https://example.com' },
      ],
    });

    executeStart(false, deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(deps.error).toHaveBeenCalledWith('Missing dependencies:');
  });

  it('should list each missing dependency', () => {
    const deps = createFakeDeps({
      validateDependencies: () => [
        { name: 'Claude CLI', installUrl: 'https://claude.example.com' },
        { name: 'gh', installUrl: 'https://gh.example.com' },
      ],
    });

    executeStart(false, deps);

    expect(deps.error).toHaveBeenCalledWith(
      '  - Claude CLI: https://claude.example.com',
    );
    expect(deps.error).toHaveBeenCalledWith(
      '  - gh: https://gh.example.com',
    );
  });

  it('should skip dependency check when flag is true', () => {
    const validateDependencies = vi.fn(() => [
      { name: 'missing', installUrl: 'https://example.com' },
    ]);
    const deps = createFakeDeps({ validateDependencies });

    executeStart(true, deps);

    expect(validateDependencies).not.toHaveBeenCalled();
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it('should start server when all dependencies are present', () => {
    const startServer = vi.fn(() => Promise.resolve());
    const deps = createFakeDeps({ startServer });

    executeStart(false, deps);

    expect(startServer).toHaveBeenCalled();
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it('should call exit(1) when server fails to start', async () => {
    const serverError = new Error('port in use');
    const startServer = () => Promise.reject(serverError);
    const deps = createFakeDeps({ startServer });

    executeStart(false, deps);

    await vi.waitFor(() => {
      expect(deps.exit).toHaveBeenCalledWith(1);
      expect(deps.error).toHaveBeenCalledWith('Fatal error:', serverError);
    });
  });
});
