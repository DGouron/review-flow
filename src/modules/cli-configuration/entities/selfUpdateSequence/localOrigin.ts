import { isIpInCidr } from '@/modules/platform-integration/entities/transport/cidr.js';

const IPV4_LOOPBACK_RANGE = '127.0.0.0/8';
const LOOPBACK_ADDRESSES = new Set(['::1', '::ffff:127.0.0.1']);

export function isLocalOrigin(ip: string): boolean {
  return isIpInCidr(ip, IPV4_LOOPBACK_RANGE) || LOOPBACK_ADDRESSES.has(ip);
}
