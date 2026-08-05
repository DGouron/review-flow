import { describe, it, expect } from 'vitest';

import { isLocalOrigin } from '@/modules/cli-configuration/entities/selfUpdateSequence/localOrigin.js';

describe('isLocalOrigin', () => {
  it('should recognise the IPv4 loopback address as local', () => {
    expect(isLocalOrigin('127.0.0.1')).toBe(true);
  });

  it('should recognise any address within the IPv4 loopback range as local', () => {
    expect(isLocalOrigin('127.0.0.5')).toBe(true);
  });

  it('should recognise the IPv6 loopback address as local', () => {
    expect(isLocalOrigin('::1')).toBe(true);
  });

  it('should recognise the IPv4-mapped IPv6 loopback address as local', () => {
    expect(isLocalOrigin('::ffff:127.0.0.1')).toBe(true);
  });

  it('should reject a private network IPv4 address', () => {
    expect(isLocalOrigin('192.168.1.10')).toBe(false);
  });

  it('should reject another private network IPv4 address', () => {
    expect(isLocalOrigin('10.0.0.5')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(isLocalOrigin('')).toBe(false);
  });

  it('should reject a malformed address', () => {
    expect(isLocalOrigin('not-an-ip-address')).toBe(false);
  });
});
