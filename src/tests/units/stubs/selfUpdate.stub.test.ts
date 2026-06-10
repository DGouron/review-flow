import { describe, it, expect } from 'vitest';

import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';

describe('StubSelfUpdateCommand', () => {
  describe('runGlobalUpdate', () => {
    it('should return success when configured to succeed', async () => {
      const stub = new StubSelfUpdateCommand(true);

      const result = await stub.runGlobalUpdate();

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return failure with error when configured to fail', async () => {
      const stub = new StubSelfUpdateCommand(false, 'Update failed: permission denied');

      const result = await stub.runGlobalUpdate();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update failed: permission denied');
    });

    it('should succeed by default', async () => {
      const stub = new StubSelfUpdateCommand();

      const result = await stub.runGlobalUpdate();

      expect(result.success).toBe(true);
    });
  });

  describe('restartDaemon', () => {
    it('should resolve without error', async () => {
      const stub = new StubSelfUpdateCommand();

      await expect(stub.restartDaemon()).resolves.toBeUndefined();
    });
  });
});
