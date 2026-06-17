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

interface GuardOutcome {
  nextCalled: boolean;
  statusCode: number | null;
  sent: boolean;
}

function runGuard(request: FakeRequest): GuardOutcome {
  let nextCalled = false;
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

  return { nextCalled, statusCode: reply.statusCode, sent: reply.sent };
}

describe('SPEC-201 transport provenance hardening (acceptance — full chokepoint transportGuardMiddleware)', () => {
  it('AC3 + AC5: allowlisted, https, hop-trusted request reaches the handler via next() with no rejection', () => {
    const outcome = runGuard(buildRequest());

    expect(outcome.nextCalled).toBe(true);
    expect(outcome.statusCode).toBeNull();
    expect(outcome.sent).toBe(false);
  });

  it('AC1 + AC5: untrusted direct socket is rejected with 403 and the handler is never reached', () => {
    const outcome = runGuard(buildRequest({ remoteAddress: '203.0.113.7' }));

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.statusCode).toBe(403);
    expect(outcome.sent).toBe(true);
  });

  it('AC2: a hop-trusted request whose forwarded protocol is not https is rejected with 403', () => {
    const outcome = runGuard(buildRequest({ proto: 'http' }));

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.statusCode).toBe(403);
  });

  it('AC4: a request whose resolved client ip is outside every configured cidr range is rejected with 403', () => {
    const outcome = runGuard(buildRequest({ forwardedFor: '192.168.1.1' }));

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.statusCode).toBe(403);
  });

  it('AC1 + AC6: a spoofed X-Forwarded-For cannot rescue an untrusted socket — header is ignored, request still rejected', () => {
    const outcome = runGuard(
      buildRequest({ remoteAddress: '203.0.113.7', forwardedFor: '10.20.30.40' }),
    );

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.statusCode).toBe(403);
  });
});
