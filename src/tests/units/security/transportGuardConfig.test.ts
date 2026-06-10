import { describe, it, expect, afterEach } from 'vitest';

import {
  DEFAULT_LOOPBACK_HOP,
  resolveTrustedHopAddress,
  resolveAllowedCidrRanges,
  transportTrustProxyValue,
} from '@/security/transportGuardConfig.js';

const HOP_KEY = 'WEBHOOK_TRUSTED_HOP';
const CIDR_KEY = 'WEBHOOK_ALLOWED_CIDR_RANGES';

describe('transportGuardConfig (AC8)', () => {
  const originalHop = process.env[HOP_KEY];
  const originalCidr = process.env[CIDR_KEY];

  afterEach(() => {
    if (originalHop === undefined) Reflect.deleteProperty(process.env, HOP_KEY);
    else process.env[HOP_KEY] = originalHop;
    if (originalCidr === undefined) Reflect.deleteProperty(process.env, CIDR_KEY);
    else process.env[CIDR_KEY] = originalCidr;
  });

  it('defaults the trusted hop to the loopback address', () => {
    Reflect.deleteProperty(process.env, HOP_KEY);
    expect(resolveTrustedHopAddress()).toBe(DEFAULT_LOOPBACK_HOP);
  });

  it('the trust proxy value equals the configured hop and is never the boolean true', () => {
    process.env[HOP_KEY] = '127.0.0.1';
    const value = transportTrustProxyValue();

    expect(value).toBe('127.0.0.1');
    expect(typeof value).toBe('string');
    expect(value).not.toBe(true);
  });

  it('parses a comma-separated CIDR allowlist into trimmed entries', () => {
    process.env[CIDR_KEY] = ' 10.0.0.0/8 , 172.16.0.0/12 ';
    expect(resolveAllowedCidrRanges()).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  it('returns an empty allowlist when none is configured', () => {
    Reflect.deleteProperty(process.env, CIDR_KEY);
    expect(resolveAllowedCidrRanges()).toEqual([]);
  });
});
