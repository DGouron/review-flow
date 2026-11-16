import type { ClientIpResolver } from '@/modules/platform-integration/entities/transport/clientIpResolver.gateway.js';
import type { TransportRejectionLog } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportRejectionLog.js';
import { evaluateTransport } from '@/modules/platform-integration/usecases/transport/evaluateTransport.usecase.js';

export interface TransportGuardConfig {
  trustedHopAddress: string;
  allowedCidrRanges: string[];
}

type HeaderValue = string | string[] | undefined;

interface GuardRequest {
  socket: { remoteAddress: string | undefined };
  headers: Record<string, HeaderValue>;
}

interface GuardReply {
  code(status: number): unknown;
  send(): unknown;
}

export interface TransportGuardInput {
  request: GuardRequest;
  reply: GuardReply;
  next: () => void;
  resolver: ClientIpResolver;
  rejectionLog: TransportRejectionLog;
}

function singleHeaderValue(value: HeaderValue): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function transportGuardMiddleware(
  input: TransportGuardInput,
  config: TransportGuardConfig,
): void {
  const directSocketAddress = input.request.socket.remoteAddress ?? '';
  const socketTrusted = directSocketAddress === config.trustedHopAddress;

  const resolvedClientIp = input.resolver.resolve({
    socketTrusted,
    forwardedFor: singleHeaderValue(input.request.headers['x-forwarded-for']),
  });

  const decision = evaluateTransport({
    directSocketAddress,
    trustedHopAddress: config.trustedHopAddress,
    forwardedProto: singleHeaderValue(input.request.headers['x-forwarded-proto']),
    resolvedClientIp,
    allowedCidrRanges: config.allowedCidrRanges,
  });

  if (decision.kind === 'reject') {
    input.rejectionLog.record({
      reason: decision.reason,
      clientIp: resolvedClientIp,
      socketAddress: directSocketAddress,
    });
    input.reply.code(decision.status);
    input.reply.send();
    return;
  }

  input.next();
}
