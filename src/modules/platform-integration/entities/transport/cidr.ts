import { CidrRange } from '@/modules/platform-integration/entities/transport/cidrRange.valueObject.js';

/**
 * True when `ip` belongs to `cidr`. Supports IPv4 and IPv6; an address never
 * matches a range of the other family. A malformed range matches nothing.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  return CidrRange.parse(cidr)?.contains(ip) ?? false;
}
