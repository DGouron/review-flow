import { describe, it, expect, vi, afterEach } from 'vitest';

import { NpmPackageVersionGateway } from '@/modules/cli-configuration/interface-adapters/gateways/packageVersion.npm.gateway.js';

describe('NpmPackageVersionGateway', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return version on successful registry response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.5.0' }),
    });

    const gateway = new NpmPackageVersionGateway('reviewflow');

    const result = await gateway.fetchLatestVersion();

    expect(result).toBe('2.5.0');
  });

  it('should return null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const gateway = new NpmPackageVersionGateway('reviewflow');

    const result = await gateway.fetchLatestVersion();

    expect(result).toBeNull();
  });

  it('should return null on malformed response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: 'reviewflow' }),
    });

    const gateway = new NpmPackageVersionGateway('reviewflow');

    const result = await gateway.fetchLatestVersion();

    expect(result).toBeNull();
  });

  it('should return null on non-200 status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const gateway = new NpmPackageVersionGateway('reviewflow');

    const result = await gateway.fetchLatestVersion();

    expect(result).toBeNull();
  });
});
