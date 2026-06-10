import { describe, it, expect } from 'vitest';

import { transportGuardMiddleware } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';
import type { TransportGuardConfig } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';
import { ForwardedForClientIpResolver } from '@/modules/platform-integration/interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.js';

const TRUSTED_HOP = '127.0.0.1';

const config: TransportGuardConfig = {
  trustedHopAddress: TRUSTED_HOP,
  allowedCidrRanges: ['10.20.30.0/24'],
};

interface FakeRequest {
  socket: { remoteAddress: string | undefined };
  headers: Record<string, string | undefined>;
}

class FakeResponse {
  statusCode: number | null = null;
  sent = false;

  code(status: number): this {
    this.statusCode = status;
    return this;
  }

  send(): this {
    this.sent = true;
    return this;
  }
}

function buildRequest(
  overrides: Partial<{ remoteAddress: string; proto: string; forwardedFor: string }> = {},
): FakeRequest {
  return {
    socket: { remoteAddress: overrides.remoteAddress ?? TRUSTED_HOP },
    headers: {
      'x-forwarded-proto': overrides.proto ?? 'https',
      'x-forwarded-for': overrides.forwardedFor ?? '10.20.30.40, 127.0.0.1',
    },
  };
}

describe('transportGuardMiddleware (AC5)', () => {
  it('calls next on a fully valid transport and never sends a rejection', () => {
    let nextCalled = false;
    const request = buildRequest();
    const reply = new FakeResponse();

    transportGuardMiddleware(
      {
        request,
        reply,
        next: () => {
          nextCalled = true;
        },
        resolver: new ForwardedForClientIpResolver(),
      },
      config,
    );

    expect(nextCalled).toBe(true);
    expect(reply.statusCode).toBeNull();
    expect(reply.sent).toBe(false);
  });

  it('rejects with 403 and never calls next when the socket is untrusted', () => {
    let nextCalled = false;
    const request = buildRequest({ remoteAddress: '203.0.113.7' });
    const reply = new FakeResponse();

    transportGuardMiddleware(
      {
        request,
        reply,
        next: () => {
          nextCalled = true;
        },
        resolver: new ForwardedForClientIpResolver(),
      },
      config,
    );

    expect(nextCalled).toBe(false);
    expect(reply.statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });

  it('rejects with 403 when the forwarded protocol is not https', () => {
    let nextCalled = false;
    const request = buildRequest({ proto: 'http' });
    const reply = new FakeResponse();

    transportGuardMiddleware(
      {
        request,
        reply,
        next: () => {
          nextCalled = true;
        },
        resolver: new ForwardedForClientIpResolver(),
      },
      config,
    );

    expect(nextCalled).toBe(false);
    expect(reply.statusCode).toBe(403);
  });

  it('rejects with 403 when the resolved client ip is off the allowlist', () => {
    let nextCalled = false;
    const request = buildRequest({ forwardedFor: '192.168.1.1' });
    const reply = new FakeResponse();

    transportGuardMiddleware(
      {
        request,
        reply,
        next: () => {
          nextCalled = true;
        },
        resolver: new ForwardedForClientIpResolver(),
      },
      config,
    );

    expect(nextCalled).toBe(false);
    expect(reply.statusCode).toBe(403);
  });
});
