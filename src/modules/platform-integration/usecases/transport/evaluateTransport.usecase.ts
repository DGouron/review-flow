import { isIpInCidr } from '@/modules/platform-integration/entities/transport/cidr.js';
import type {
  TransportContext,
  TransportDecision,
} from '@/modules/platform-integration/entities/transport/transportContext.js';

const REJECT_STATUS = 403;

export function evaluateTransport(context: TransportContext): TransportDecision {
  if (context.directSocketAddress !== context.trustedHopAddress) {
    return { kind: 'reject', status: REJECT_STATUS, reason: 'untrusted-socket' };
  }

  if (context.forwardedProto !== 'https') {
    return { kind: 'reject', status: REJECT_STATUS, reason: 'non-https' };
  }

  const clientIp = context.resolvedClientIp;
  const allowed =
    clientIp !== null && context.allowedCidrRanges.some((range) => isIpInCidr(clientIp, range));

  if (!allowed) {
    return { kind: 'reject', status: REJECT_STATUS, reason: 'off-allowlist' };
  }

  return { kind: 'accept' };
}
