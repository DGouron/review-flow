import { describe, it, expect } from 'vitest';

import { StubPackageVersionGateway } from '@/tests/stubs/packageVersion.stub.js';

describe('StubPackageVersionGateway', () => {
  it('should return configured latest version', async () => {
    const stub = new StubPackageVersionGateway('3.0.0');

    const result = await stub.fetchLatestVersion();

    expect(result).toBe('3.0.0');
  });

  it('should return null when configured with null', async () => {
    const stub = new StubPackageVersionGateway(null);

    const result = await stub.fetchLatestVersion();

    expect(result).toBeNull();
  });

  it('should return null by default', async () => {
    const stub = new StubPackageVersionGateway();

    const result = await stub.fetchLatestVersion();

    expect(result).toBeNull();
  });
});
