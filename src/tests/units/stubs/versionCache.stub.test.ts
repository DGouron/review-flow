import { describe, it, expect } from 'vitest';

import { PackageVersionFactory } from '@/tests/factories/packageVersion.factory.js';
import { StubVersionCache } from '@/tests/stubs/versionCache.stub.js';

describe('StubVersionCache', () => {
  it('should return null when no cached value is set', () => {
    const stub = new StubVersionCache();

    expect(stub.get()).toBeNull();
  });

  it('should return the cached value when set', () => {
    const cached = PackageVersionFactory.createVersionCheckResult();
    const stub = new StubVersionCache(cached);

    expect(stub.get()).toEqual(cached);
  });

  it('should store a value via set', () => {
    const stub = new StubVersionCache();
    const value = PackageVersionFactory.createVersionCheckResult({ currentVersion: '5.0.0' });

    stub.set(value);

    expect(stub.get()).toEqual(value);
  });

  it('should report expired when configured as expired', () => {
    const stub = new StubVersionCache(null, true);

    expect(stub.isExpired()).toBe(true);
  });

  it('should report not expired when configured as not expired', () => {
    const cached = PackageVersionFactory.createVersionCheckResult();
    const stub = new StubVersionCache(cached, false);

    expect(stub.isExpired()).toBe(false);
  });

  it('should report expired by default when no cached value', () => {
    const stub = new StubVersionCache();

    expect(stub.isExpired()).toBe(true);
  });
});
