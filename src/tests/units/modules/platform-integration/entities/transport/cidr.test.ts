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

  describe('ipv6 ranges published by GitHub meta', () => {
    it('matches an ipv6 address inside a /32 range', () => {
      expect(isIpInCidr('2606:50c0:8000::154', '2606:50c0::/32')).toBe(true);
    });

    it('matches an ipv6 address inside a /29 range that is not byte aligned', () => {
      expect(isIpInCidr('2a0a:a447:ffff::1', '2a0a:a440::/29')).toBe(true);
    });

    it('rejects an ipv6 address just outside a /29 range', () => {
      expect(isIpInCidr('2a0a:a448::1', '2a0a:a440::/29')).toBe(false);
    });

    it('matches only the exact address when prefix is 128', () => {
      expect(isIpInCidr('2001:db8::1', '2001:db8::1/128')).toBe(true);
      expect(isIpInCidr('2001:db8::2', '2001:db8::1/128')).toBe(false);
    });

    it('compares fully expanded and compressed notations as the same address', () => {
      expect(isIpInCidr('2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1/128')).toBe(true);
    });

    it('matches everything when prefix is 0', () => {
      expect(isIpInCidr('2001:db8::1', '::/0')).toBe(true);
    });

    it('returns false when the ipv6 prefix is greater than 128', () => {
      expect(isIpInCidr('2001:db8::1', '2001:db8::/129')).toBe(false);
    });

    it('never matches an ipv4 address against an ipv6 range', () => {
      expect(isIpInCidr('10.0.0.1', '::/0')).toBe(false);
    });

    it('never matches an ipv6 address against an ipv4 range', () => {
      expect(isIpInCidr('2001:db8::1', '0.0.0.0/0')).toBe(false);
    });

    it('returns false for a malformed ipv6 address', () => {
      expect(isIpInCidr('2001:db8::1::2', '2001:db8::/32')).toBe(false);
      expect(isIpInCidr('2001:db8:zzzz::1', '2001:db8::/32')).toBe(false);
      expect(isIpInCidr('1:2:3:4:5:6:7:8:9', '::/0')).toBe(false);
    });
  });
});
