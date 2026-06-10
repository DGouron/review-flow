import { describe, it, expect, vi } from 'vitest';

import { executeValidate, type ValidateDependencies } from '@/main/commands/validate.command.js';

function createFakeValidateDeps(overrides?: Partial<ValidateDependencies>): ValidateDependencies {
  return {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    getConfigDir: vi.fn(() => '/home/user/.reviewflow'),
    getCwd: vi.fn(() => '/project'),
    log: vi.fn(),
    exit: vi.fn(),
    ...overrides,
  };
}

const validConfig = JSON.stringify({
  server: { port: 3000, host: 'localhost' },
  user: { gitlabUsername: 'me' },
  queue: { concurrency: 1, timeoutMs: 1000 },
  repositories: [],
});

describe('executeValidate', () => {
  describe('not-found branch', () => {
    it('logs not-found message and exits 1 when no config file exists anywhere', () => {
      const deps = createFakeValidateDeps({ existsSync: vi.fn(() => false) });

      executeValidate(false, deps);

      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('No configuration found'));
      expect(deps.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('valid branch', () => {
    it('logs success and does not exit when config is valid', () => {
      const deps = createFakeValidateDeps({
        existsSync: vi.fn((path: string) => path.endsWith('config.json') || path.endsWith('.env')),
        readFileSync: vi.fn(() => validConfig),
      });

      executeValidate(false, deps);

      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('valid'));
      expect(deps.exit).not.toHaveBeenCalled();
    });
  });

  describe('invalid branch', () => {
    it('logs issues and exits 1 when config has invalid JSON', () => {
      const deps = createFakeValidateDeps({
        existsSync: vi.fn((path: string) => path.endsWith('config.json')),
        readFileSync: vi.fn(() => '{ broken json'),
      });

      executeValidate(false, deps);

      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('issues'));
      expect(deps.exit).toHaveBeenCalledWith(1);
    });

    it('mentions --fix flag when fix=true and config is invalid', () => {
      const deps = createFakeValidateDeps({
        existsSync: vi.fn((path: string) => path.endsWith('config.json')),
        readFileSync: vi.fn(() => '{ broken json'),
      });

      executeValidate(true, deps);

      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('--fix flag detected'));
    });
  });

  describe('config path resolution', () => {
    it('prefers cwd/config.json over configDir/config.json when both exist', () => {
      const existsSync = vi.fn(
        (path: string) => path === '/project/config.json' || path === '/project/.env',
      );
      const readFileSync = vi.fn(() => validConfig);
      const deps = createFakeValidateDeps({ existsSync, readFileSync });

      executeValidate(false, deps);

      expect(readFileSync).toHaveBeenCalledWith('/project/config.json', 'utf-8');
    });

    it('falls back to configDir/config.json when cwd has no config', () => {
      const existsSync = vi.fn(
        (path: string) =>
          path === '/home/user/.reviewflow/config.json' || path === '/home/user/.reviewflow/.env',
      );
      const readFileSync = vi.fn(() => validConfig);
      const deps = createFakeValidateDeps({ existsSync, readFileSync });

      executeValidate(false, deps);

      expect(readFileSync).toHaveBeenCalledWith('/home/user/.reviewflow/config.json', 'utf-8');
    });
  });
});
