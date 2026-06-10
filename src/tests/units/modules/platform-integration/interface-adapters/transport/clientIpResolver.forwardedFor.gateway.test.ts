import { describe, it, expect } from 'vitest';

import { ForwardedForClientIpResolver } from '@/modules/platform-integration/interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.js';

describe('ForwardedForClientIpResolver', () => {
  it('returns null and never reads forwardedFor when the socket is not trusted', () => {
    const resolver = new ForwardedForClientIpResolver();

    const resolved = resolver.resolve({
      socketTrusted: false,
      forwardedFor: '10.20.30.40, 127.0.0.1',
    });

    expect(resolved).toBeNull();
  });

  it('resolves the leftmost forwarded address once the socket is trusted', () => {
    const resolver = new ForwardedForClientIpResolver();

    const resolved = resolver.resolve({
      socketTrusted: true,
      forwardedFor: '10.20.30.40, 127.0.0.1',
    });

    expect(resolved).toBe('10.20.30.40');
  });

  it('returns null when trusted but no forwarded address is present', () => {
    const resolver = new ForwardedForClientIpResolver();

    const resolved = resolver.resolve({
      socketTrusted: true,
      forwardedFor: null,
    });

    expect(resolved).toBeNull();
  });
});
