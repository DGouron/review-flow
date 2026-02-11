import { describe, it, expect, vi } from 'vitest';
import { executeStart, type StartDependencies } from '../../../main/cli.js';
import type { StartDaemonDependencies } from '../../../usecases/cli/startDaemon.usecase.js';

function createFakeStartDaemonDeps(
  overrides?: Partial<StartDaemonDependencies>,
): StartDaemonDependencies {
  return {
    readPidFile: vi.fn(() => null),
    writePidFile: vi.fn(),
    isProcessRunning: vi.fn(() => false),
    spawnDaemon: vi.fn(() => 42),
    ...overrides,
  };
}

function createFakeDeps(
  overrides: Partial<StartDependencies> = {},
): StartDependencies {
  return {
    validateDependencies: () => [],
    startServer: () => Promise.resolve(),
    exit: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    startDaemonDeps: createFakeStartDaemonDeps(),
    loadStartupInfo: () => ({ enabledPlatforms: [], defaultPort: 3000 }),
    openInBrowser: vi.fn(),
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

    executeStart(false, false, undefined, false, deps);

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

    executeStart(false, false, undefined, false, deps);

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

    executeStart(true, false, undefined, false, deps);

    expect(validateDependencies).not.toHaveBeenCalled();
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it('should start server when all dependencies are present', () => {
    const startServer = vi.fn(() => Promise.resolve());
    const deps = createFakeDeps({ startServer });

    executeStart(false, false, undefined, false, deps);

    expect(startServer).toHaveBeenCalled();
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it('should call exit(1) when server fails to start', async () => {
    const serverError = new Error('port in use');
    const startServer = () => Promise.reject(serverError);
    const deps = createFakeDeps({ startServer });

    executeStart(false, false, undefined, false, deps);

    await vi.waitFor(() => {
      expect(deps.exit).toHaveBeenCalledWith(1);
      expect(deps.error).toHaveBeenCalledWith('Fatal error:', serverError);
    });
  });

  it('should spawn daemon when daemon flag is true', () => {
    const spawnDaemon = vi.fn(() => 123);
    const deps = createFakeDeps({
      startDaemonDeps: createFakeStartDaemonDeps({ spawnDaemon }),
    });

    executeStart(false, true, 4000, false, deps);

    expect(spawnDaemon).toHaveBeenCalledWith(4000);
    expect(deps.log).toHaveBeenCalled();
  });

  it('should not start server when daemon mode is requested', () => {
    const startServer = vi.fn(() => Promise.resolve());
    const deps = createFakeDeps({ startServer });

    executeStart(false, true, undefined, false, deps);

    expect(startServer).not.toHaveBeenCalled();
  });

  it('should display startup banner in daemon mode', () => {
    const spawnDaemon = vi.fn(() => 123);
    const deps = createFakeDeps({
      startDaemonDeps: createFakeStartDaemonDeps({ spawnDaemon }),
      loadStartupInfo: () => ({ enabledPlatforms: ['gitlab'] as Array<'gitlab' | 'github'>, defaultPort: 3000 }),
    });

    executeStart(false, true, 4000, false, deps);

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:4000/dashboard/'));
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('/webhooks/gitlab'));
  });

  it('should open browser when open flag is true in daemon mode', () => {
    const spawnDaemon = vi.fn(() => 123);
    const openInBrowser = vi.fn();
    const deps = createFakeDeps({
      startDaemonDeps: createFakeStartDaemonDeps({ spawnDaemon }),
      openInBrowser,
    });

    executeStart(false, true, 3000, true, deps);

    expect(openInBrowser).toHaveBeenCalledWith('http://localhost:3000/dashboard/');
  });

  it('should not open browser when open flag is false', () => {
    const spawnDaemon = vi.fn(() => 123);
    const openInBrowser = vi.fn();
    const deps = createFakeDeps({
      startDaemonDeps: createFakeStartDaemonDeps({ spawnDaemon }),
      openInBrowser,
    });

    executeStart(false, true, 3000, false, deps);

    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it('should display startup banner in foreground mode', async () => {
    const deps = createFakeDeps({
      loadStartupInfo: () => ({ enabledPlatforms: ['github'] as Array<'gitlab' | 'github'>, defaultPort: 3000 }),
    });

    executeStart(true, false, 5000, false, deps);

    await vi.waitFor(() => {
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5000/dashboard/'));
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('/webhooks/github'));
    });
  });

  it('should open browser when open flag is true in foreground mode', async () => {
    const openInBrowser = vi.fn();
    const deps = createFakeDeps({ openInBrowser });

    executeStart(true, false, 3000, true, deps);

    await vi.waitFor(() => {
      expect(openInBrowser).toHaveBeenCalledWith('http://localhost:3000/dashboard/');
    });
  });

  it('should use default port from config when no port specified', async () => {
    const deps = createFakeDeps({
      loadStartupInfo: () => ({ enabledPlatforms: [] as Array<'gitlab' | 'github'>, defaultPort: 8080 }),
    });

    executeStart(true, false, undefined, false, deps);

    await vi.waitFor(() => {
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('8080'));
    });
  });
});
