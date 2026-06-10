import { describe, it, expect } from 'vitest';

import { evaluateTransport } from '@/modules/platform-integration/usecases/transport/evaluateTransport.usecase.js';
import { TransportContextFactory } from '@/tests/factories/transportContext.factory.js';

describe('evaluateTransport', () => {
  describe('AC1 - untrusted socket', () => {
    it('rejects with 403 when the direct socket address is not the trusted hop, ignoring headers', () => {
      const context = TransportContextFactory.valid({
        directSocketAddress: '203.0.113.7',
        forwardedProto: 'https',
        resolvedClientIp: '10.20.30.40',
      });

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'reject', status: 403, reason: 'untrusted-socket' });
    });

    it('does not consult the protocol or client ip once the socket fails', () => {
      const context = TransportContextFactory.valid({
        directSocketAddress: '203.0.113.7',
        forwardedProto: 'http',
        resolvedClientIp: null,
        allowedCidrRanges: [],
      });

      const decision = evaluateTransport(context);

      expect(decision.kind).toBe('reject');
    });
  });

  describe('AC2 - non-https', () => {
    it('rejects with 403 when the forwarded protocol is not https', () => {
      const context = TransportContextFactory.valid({ forwardedProto: 'http' });

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'reject', status: 403, reason: 'non-https' });
    });

    it('rejects with 403 when no forwarded protocol is present', () => {
      const context = TransportContextFactory.valid({ forwardedProto: null });

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'reject', status: 403, reason: 'non-https' });
    });
  });

  describe('AC3 - allowlisted, https, hop-trusted', () => {
    it('accepts a fully valid transport context', () => {
      const context = TransportContextFactory.valid();

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'accept' });
    });
  });

  describe('AC4 - off-allowlist', () => {
    it('rejects with 403 when the resolved client ip is outside every configured range', () => {
      const context = TransportContextFactory.valid({
        resolvedClientIp: '192.168.1.1',
        allowedCidrRanges: ['10.20.30.0/24'],
      });

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'reject', status: 403, reason: 'off-allowlist' });
    });

    it('rejects with 403 when the client ip could not be resolved', () => {
      const context = TransportContextFactory.valid({ resolvedClientIp: null });

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'reject', status: 403, reason: 'off-allowlist' });
    });

    it('accepts when the resolved client ip falls inside one of several ranges', () => {
      const context = TransportContextFactory.valid({
        resolvedClientIp: '172.16.5.9',
        allowedCidrRanges: ['10.0.0.0/8', '172.16.0.0/12'],
      });

      const decision = evaluateTransport(context);

      expect(decision).toEqual({ kind: 'accept' });
    });
  });
});
