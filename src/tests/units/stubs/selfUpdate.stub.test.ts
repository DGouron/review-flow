import { describe, it, expect } from 'vitest';

import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';

describe('StubSelfUpdateCommand', () => {
  describe('installGlobalVersion', () => {
    it('should report installed by default', async () => {
      const stub = new StubSelfUpdateCommand();

      expect(await stub.installGlobalVersion('3.57.0')).toEqual({ kind: 'installed' });
    });

    it('should report the configured outcome', async () => {
      const stub = new StubSelfUpdateCommand({
        installOutcome: { kind: 'failed', error: 'npm install failed' },
      });

      expect(await stub.installGlobalVersion('3.57.0')).toEqual({
        kind: 'failed',
        error: 'npm install failed',
      });
    });
  });

  describe('readInstalledVersion', () => {
    it('should report the requested version as installed by default', async () => {
      const stub = new StubSelfUpdateCommand();
      await stub.installGlobalVersion('3.57.0');

      expect(await stub.readInstalledVersion()).toBe('3.57.0');
    });

    it('should report the configured installed version, even null', async () => {
      const stub = new StubSelfUpdateCommand({ installedVersionAfterInstall: null });
      await stub.installGlobalVersion('3.57.0');

      expect(await stub.readInstalledVersion()).toBeNull();
    });
  });

  describe('restartDaemon', () => {
    it('should resolve without error', async () => {
      const stub = new StubSelfUpdateCommand();

      await expect(stub.restartDaemon()).resolves.toBeUndefined();
    });
  });
});
