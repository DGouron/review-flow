import { describe, it, expect } from 'vitest';

import { transportGuardMiddleware } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';
import type { TransportGuardConfig } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';
import { ForwardedForClientIpResolver } from '@/modules/platform-integration/interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

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

function runGuard(request: FakeRequest) {
  let nextCalled = false;
  const reply = new FakeResponse();
  const capturing = createCapturingLogger();

  transportGuardMiddleware(
    {
      request,
      reply,
      next: () => {
        nextCalled = true;
      },
      resolver: new ForwardedForClientIpResolver(),
      logger: capturing.logger,
    },
    config,
  );

  return { nextCalled, reply, warnMessages: capturing.warnMessages };
}

describe('transportGuardMiddleware (AC5)', () => {
  it('calls next on a fully valid transport and never sends a rejection', () => {
    const outcome = runGuard(buildRequest());

    expect(outcome.nextCalled).toBe(true);
    expect(outcome.reply.statusCode).toBeNull();
    expect(outcome.reply.sent).toBe(false);
  });

  it('rejects with 403 and never calls next when the socket is untrusted', () => {
    const outcome = runGuard(buildRequest({ remoteAddress: '203.0.113.7' }));

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.reply.statusCode).toBe(403);
    expect(outcome.reply.sent).toBe(true);
  });

  it('rejects with 403 when the forwarded protocol is not https', () => {
    const outcome = runGuard(buildRequest({ proto: 'http' }));

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.reply.statusCode).toBe(403);
  });

  it('rejects with 403 when the resolved client ip is off the allowlist', () => {
    const outcome = runGuard(buildRequest({ forwardedFor: '192.168.1.1' }));

    expect(outcome.nextCalled).toBe(false);
    expect(outcome.reply.statusCode).toBe(403);
  });
});

describe('transportGuardMiddleware rejection logging', () => {
  it('logs one warn line with the source address and the reason when off the allowlist', () => {
    const outcome = runGuard(buildRequest({ forwardedFor: '9.234.106.50' }));

    expect(outcome.warnMessages).toHaveLength(1);
    expect(outcome.warnMessages[0]).toContain('"clientIp":"9.234.106.50"');
    expect(outcome.warnMessages[0]).toContain('"reason":"off-allowlist"');
  });

  it('logs the socket address and the reason when the socket is untrusted', () => {
    const outcome = runGuard(buildRequest({ remoteAddress: '203.0.113.7' }));

    expect(outcome.warnMessages).toHaveLength(1);
    expect(outcome.warnMessages[0]).toContain('"socketAddress":"203.0.113.7"');
    expect(outcome.warnMessages[0]).toContain('"reason":"untrusted-socket"');
  });

  it('logs nothing when the request is accepted', () => {
    const outcome = runGuard(buildRequest());

    expect(outcome.warnMessages).toEqual([]);
  });
});
