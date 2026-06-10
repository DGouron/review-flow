import type { Logger } from 'pino';

import type { EgressScanTrace } from '@/modules/platform-integration/entities/egressScan/egressScan.gateway.js';
import type { EgressTraceGateway } from '@/modules/platform-integration/entities/egressScan/egressTrace.gateway.js';

export class LoggerEgressTraceGateway implements EgressTraceGateway {
  constructor(private readonly logger: Logger) {}

  record(trace: EgressScanTrace): void {
    this.logger.warn(
      {
        channel: trace.channel,
        mode: trace.mode,
        matchCategoryCounts: trace.matchCategoryCounts,
      },
      'egress scan decision',
    );
  }
}
