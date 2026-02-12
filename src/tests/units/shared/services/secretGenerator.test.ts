import { describe, it, expect } from 'vitest';
import {
  generateWebhookSecret,
  truncateSecret,
  isValidSecret,
} from '../../../../shared/services/secretGenerator.js';

describe('generateWebhookSecret', () => {
  it('should generate a 64-character hex string', () => {
    const secret = generateWebhookSecret();

    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should generate unique secrets on each call', () => {
    const first = generateWebhookSecret();
    const second = generateWebhookSecret();

    expect(first).not.toBe(second);
  });

  it('should use injectable randomBytes for deterministic testing', () => {
    const fakeRandomBytes = () => Buffer.from('a'.repeat(32));

    const secret = generateWebhookSecret(fakeRandomBytes);

    expect(secret).toBe('61'.repeat(32));
  });
});

describe('truncateSecret', () => {
  it('should truncate a secret and append ellipsis', () => {
    const secret = 'abcdef1234567890abcdef1234567890';

    const result = truncateSecret(secret, 8);

    expect(result).toBe('abcdef12...');
  });

  it('should return the full secret if shorter than display length', () => {
    const result = truncateSecret('abc', 10);

    expect(result).toBe('abc');
  });
});

describe('isValidSecret', () => {
  it('should return true for a valid 64-char hex secret', () => {
    const valid = 'a'.repeat(64);

    expect(isValidSecret(valid)).toBe(true);
  });

  it('should return false for a secret that is too short', () => {
    expect(isValidSecret('abc')).toBe(false);
  });

  it('should return false for non-hex characters', () => {
    expect(isValidSecret('g'.repeat(64))).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidSecret('')).toBe(false);
  });
});
