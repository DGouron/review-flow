import { describe, it, expect } from 'vitest';

import { InMemoryForceCleanupLockService } from '@/modules/worktree-management/services/forceCleanupLock.js';

describe('InMemoryForceCleanupLockService', () => {
  it('grants the first tryAcquire for a key', () => {
    const lock = new InMemoryForceCleanupLockService();

    expect(lock.tryAcquire('gitlab:group/a:1')).toBe(true);
  });

  it('rejects a second tryAcquire for the same key while still held', () => {
    const lock = new InMemoryForceCleanupLockService();
    lock.tryAcquire('gitlab:group/a:1');

    expect(lock.tryAcquire('gitlab:group/a:1')).toBe(false);
  });

  it('allows tryAcquire on a different key', () => {
    const lock = new InMemoryForceCleanupLockService();
    lock.tryAcquire('gitlab:group/a:1');

    expect(lock.tryAcquire('gitlab:group/a:2')).toBe(true);
  });

  it('releases a key so a subsequent tryAcquire succeeds', () => {
    const lock = new InMemoryForceCleanupLockService();
    lock.tryAcquire('gitlab:group/a:1');
    lock.release('gitlab:group/a:1');

    expect(lock.tryAcquire('gitlab:group/a:1')).toBe(true);
  });

  it('release on an unknown key is a no-op (no throw)', () => {
    const lock = new InMemoryForceCleanupLockService();

    expect(() => lock.release('gitlab:group/x:99')).not.toThrow();
  });
});
