import { describe, expect, it } from 'vitest';

import { CidrRange } from '@/modules/platform-integration/entities/transport/cidrRange.valueObject.js';

describe('CidrRange', () => {
  describe('parse', () => {
    it('reads the family and the prefix length of an ipv4 range', () => {
      const range = CidrRange.parse('192.30.252.0/22');

      expect(range?.bitWidth).toBe(32);
      expect(range?.prefixLength).toBe(22);
      expect(range?.toString()).toBe('192.30.252.0/22');
    });

    it('reads the family and the prefix length of an ipv6 range', () => {
      const range = CidrRange.parse('2a0a:a440::/29');

      expect(range?.bitWidth).toBe(128);
      expect(range?.prefixLength).toBe(29);
    });

    it.each([
      '',
      'oops',
      '10.0.0.0',
      '10.0.0.0/',
      '10.0.0.0/ ',
      '10.0.0.0/0x0',
      '10.0.0.0/33',
      '10.0.0.0/8/32',
      '999.0.0.0/8',
      '2001:db8::/129',
      '2001:db8::1::/64',
    ])('returns null for "%s"', (text) => {
      expect(CidrRange.parse(text)).toBeNull();
    });
  });

  describe('contains', () => {
    it('is true for an address inside the range and false outside', () => {
      const range = CidrRange.parse('140.82.112.0/20');

      expect(range?.contains('140.82.127.255')).toBe(true);
      expect(range?.contains('140.82.128.0')).toBe(false);
    });

    it('compares an ipv4-mapped ipv6 range as the matching ipv4 range', () => {
      const range = CidrRange.parse('::ffff:9.234.98.160/124');

      expect(range?.bitWidth).toBe(32);
      expect(range?.prefixLength).toBe(28);
      expect(range?.contains('::ffff:9.234.98.164')).toBe(true);
      expect(range?.contains('9.234.98.164')).toBe(true);
      expect(range?.contains('9.234.98.200')).toBe(false);
    });

    it('is false for an unparseable address', () => {
      expect(CidrRange.parse('0.0.0.0/0')?.contains('not-an-ip')).toBe(false);
    });
  });
});
