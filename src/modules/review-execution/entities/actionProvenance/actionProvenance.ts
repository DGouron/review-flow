export type Provenance = 'trusted' | 'untrusted';

const CANONICAL_TRUSTED = 'trusted';

/**
 * Fail-closed provenance resolver.
 * Only the exact canonical token resolves to `trusted`; every other value
 * (including casing, padding, non-string types, null/undefined) is `untrusted`.
 * `trusted` is NEVER derived from a payload field.
 */
export function resolveProvenance(value: unknown): Provenance {
  return value === CANONICAL_TRUSTED ? 'trusted' : 'untrusted';
}
