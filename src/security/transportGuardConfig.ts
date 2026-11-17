import type { TransportGuardConfig } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';

export const DEFAULT_LOOPBACK_HOP = '127.0.0.1';

function parseCidrRanges(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((range) => range.trim())
    .filter((range) => range.length > 0);
}

/**
 * The single trusted hop the app accepts connections from. Scoped to the
 * loopback reverse proxy only; never a broad subnet, never `true`.
 */
export function resolveTrustedHopAddress(): string {
  const configured = process.env.WEBHOOK_TRUSTED_HOP;
  return typeof configured === 'string' && configured.length > 0
    ? configured
    : DEFAULT_LOOPBACK_HOP;
}

export function resolveAllowedCidrRanges(): string[] {
  return parseCidrRanges(process.env.WEBHOOK_ALLOWED_CIDR_RANGES);
}

export type AllowlistMode = 'auto' | 'manual';

/**
 * `auto` (default): GitHub webhook ranges are read from GitHub meta and
 * `WEBHOOK_ALLOWED_CIDR_RANGES` is added to them. `manual`: only the variable.
 */
export function resolveAllowlistMode(): AllowlistMode {
  const configured = process.env.WEBHOOK_ALLOWLIST_MODE?.trim().toLowerCase();
  return configured === 'manual' ? 'manual' : 'auto';
}

export function resolveTransportGuardConfig(): TransportGuardConfig {
  return {
    trustedHopAddress: resolveTrustedHopAddress(),
    allowedCidrRanges: resolveAllowedCidrRanges(),
  };
}

/**
 * The value handed to Fastify's `trustProxy` option. It is always the single
 * loopback hop, never `true` and never an arbitrary/broad value, so Express-style
 * derived request attributes cannot be inflated from client-supplied headers.
 */
export function transportTrustProxyValue(): string {
  return resolveTrustedHopAddress();
}
