import { randomBytes as cryptoRandomBytes } from 'node:crypto';

type RandomBytesFunction = (size: number) => Buffer;

export function generateWebhookSecret(
  randomBytes: RandomBytesFunction = cryptoRandomBytes,
): string {
  return randomBytes(32).toString('hex');
}

export function truncateSecret(secret: string, displayLength: number): string {
  if (secret.length <= displayLength) return secret;
  return `${secret.slice(0, displayLength)}...`;
}

export function isValidSecret(secret: string): boolean {
  return /^[0-9a-f]{64}$/.test(secret);
}
