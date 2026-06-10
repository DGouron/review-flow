import { describe, expect, it } from 'vitest';

import { isIpInCidr } from '@/modules/platform-integration/entities/transport/cidr.js';

describe('isIpInCidr', () => {
  describe('happy path', () => {
    it('matches an ip inside the range', () => {
      expect(isIpInCidr('192.168.1.42', '192.168.1.0/24')).toBe(true);
    });

    it('rejects an ip outside the range', () => {
      expect(isIpInCidr('192.168.2.42', '192.168.1.0/24')).toBe(false);
    });
  });

  describe('prefix boundaries', () => {
    it('matches everything when prefix is 0', () => {
      expect(isIpInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
    });

    it('matches only the exact ip when prefix is 32', () => {
      expect(isIpInCidr('10.0.0.1', '10.0.0.1/32')).toBe(true);
      expect(isIpInCidr('10.0.0.2', '10.0.0.1/32')).toBe(false);
    });

    it('returns false when prefix is not an integer', () => {
      expect(isIpInCidr('192.168.1.1', '192.168.1.0/abc')).toBe(false);
    });

    it('returns false when prefix is negative', () => {
      expect(isIpInCidr('192.168.1.1', '192.168.1.0/-1')).toBe(false);
    });

    it('returns false when prefix is greater than 32', () => {
      expect(isIpInCidr('192.168.1.1', '192.168.1.0/33')).toBe(false);
    });

    it('returns false when prefix is missing', () => {
      expect(isIpInCidr('192.168.1.1', '192.168.1.0')).toBe(false);
    });
  });

  describe('invalid ip parsing', () => {
    it('returns false when the ip has fewer than four octets', () => {
      expect(isIpInCidr('192.168.1', '192.168.1.0/24')).toBe(false);
    });

    it('returns false when the ip has more than four octets', () => {
      expect(isIpInCidr('192.168.1.1.1', '192.168.1.0/24')).toBe(false);
    });

    it('returns false when an octet is non-numeric', () => {
      expect(isIpInCidr('192.168.1.x', '192.168.1.0/24')).toBe(false);
    });

    it('returns false when an octet exceeds 255', () => {
      expect(isIpInCidr('192.168.1.256', '192.168.1.0/24')).toBe(false);
    });

    it('returns false when the range ip is malformed', () => {
      expect(isIpInCidr('192.168.1.1', '999.168.1.0/24')).toBe(false);
    });
  });
});
