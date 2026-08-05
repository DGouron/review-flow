import { describe, it, expect, vi } from 'vitest';

import {
  SourceCheckoutUpdateCliGateway,
  type SourceCheckoutUpdateCliDependencies,
} from '@/modules/cli-configuration/interface-adapters/gateways/sourceCheckoutUpdate.cli.gateway.js';

function createFakeDependencies(
  overrides?: Partial<SourceCheckoutUpdateCliDependencies>,
): SourceCheckoutUpdateCliDependencies {
  return {
    checkoutPath: '/repository',
    execFileAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    existsSyncImpl: () => false,
    ...overrides,
  };
}

describe('SourceCheckoutUpdateCliGateway', () => {
  describe('getCurrentBranch', () => {
    it('returns the trimmed branch name from git rev-parse', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockResolvedValue({ stdout: 'master\n', stderr: '' }),
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      const branch = await gateway.getCurrentBranch();

      expect(branch).toBe('master');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('returns true when git status --porcelain reports changes', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockResolvedValue({ stdout: ' M src/index.ts\n', stderr: '' }),
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.hasUncommittedChanges()).toBe(true);
    });

    it('returns false when git status --porcelain reports nothing', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.hasUncommittedChanges()).toBe(false);
    });
  });

  describe('resolveToolPath', () => {
    it('returns the first existing candidate location', async () => {
      const deps = createFakeDependencies({
        existsSyncImpl: (path: string) => path === '/usr/local/bin/yarn',
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.resolveToolPath('yarn')).toBe('/usr/local/bin/yarn');
    });

    it('falls back to probing an augmented PATH when no candidate exists', async () => {
      const execFileAsync = vi.fn().mockResolvedValue({ stdout: '/opt/tools/git\n', stderr: '' });
      const deps = createFakeDependencies({ existsSyncImpl: () => false, execFileAsync });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      const resolved = await gateway.resolveToolPath('git');

      expect(resolved).toBe('/opt/tools/git');
      expect(execFileAsync).toHaveBeenCalledWith('which', ['git'], expect.any(Object));
    });

    it('returns null without throwing when the tool cannot be found', async () => {
      const deps = createFakeDependencies({
        existsSyncImpl: () => false,
        execFileAsync: vi.fn().mockRejectedValue(new Error('not found')),
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      await expect(gateway.resolveToolPath('yarn')).resolves.toBeNull();
    });
  });

  describe('fetchLatest', () => {
    it('returns success when git pull succeeds', async () => {
      const deps = createFakeDependencies();
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.fetchLatest()).toEqual({ success: true, error: null });
    });

    it('returns the failure detail when git pull fails', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockRejectedValue(new Error('CONFLICT (content): Merge conflict')),
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.fetchLatest()).toEqual({
        success: false,
        error: 'CONFLICT (content): Merge conflict',
      });
    });
  });

  describe('rebuild', () => {
    it('returns success when yarn build succeeds', async () => {
      const deps = createFakeDependencies();
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.rebuild()).toEqual({ success: true, error: null });
    });

    it('returns the failure detail when yarn build fails', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockRejectedValue(new Error('error TS2322: Type mismatch')),
      });
      const gateway = new SourceCheckoutUpdateCliGateway(deps);

      expect(await gateway.rebuild()).toEqual({
        success: false,
        error: 'error TS2322: Type mismatch',
      });
    });
  });
});
