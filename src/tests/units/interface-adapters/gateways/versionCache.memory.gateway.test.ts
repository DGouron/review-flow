import { describe, it, expect, vi, afterEach } from 'vitest';

import { VersionCacheMemoryGateway } from '@/modules/cli-configuration/interface-adapters/gateways/versionCache.memory.gateway.js';
import { PackageVersionFactory } from '@/tests/factories/packageVersion.factory.js';

describe('VersionCacheMemoryGateway', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null when empty', () => {
    const cache = new VersionCacheMemoryGateway();

    expect(cache.get()).toBeNull();
  });

  it('should return cached result after set', () => {
    const cache = new VersionCacheMemoryGateway();
    const versionCheckResult = PackageVersionFactory.createVersionCheckResult();

    cache.set(versionCheckResult);

    expect(cache.get()).toEqual(versionCheckResult);
  });

  it('should report isExpired as true when empty', () => {
    const cache = new VersionCacheMemoryGateway();

    expect(cache.isExpired()).toBe(true);
  });

  it('should report isExpired as false after set within TTL', () => {
    const cache = new VersionCacheMemoryGateway(60_000);
    const versionCheckResult = PackageVersionFactory.createVersionCheckResult();

    cache.set(versionCheckResult);

    expect(cache.isExpired()).toBe(false);
  });

  it('should report isExpired as true after TTL expires', () => {
    vi.useFakeTimers();
    const ttlMilliseconds = 60_000;
    const cache = new VersionCacheMemoryGateway(ttlMilliseconds);
    const versionCheckResult = PackageVersionFactory.createVersionCheckResult();

    cache.set(versionCheckResult);
    vi.advanceTimersByTime(ttlMilliseconds + 1);

    expect(cache.isExpired()).toBe(true);
  });
});
