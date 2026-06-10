import type {
  EgressScanGateway,
  EgressScanInput,
  EgressScanResult,
} from '@/modules/platform-integration/entities/egressScan/egressScan.gateway.js';
import type { EgressScanTrace } from '@/modules/platform-integration/entities/egressScan/egressScan.gateway.js';
import type { EgressTraceGateway } from '@/modules/platform-integration/entities/egressScan/egressTrace.gateway.js';

export class StubEgressScanGateway implements EgressScanGateway {
  readonly calls: EgressScanInput[] = [];
  private result: EgressScanResult | null = null;
  private shouldFail = false;

  setResult(result: EgressScanResult): void {
    this.result = result;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  scan(input: EgressScanInput): EgressScanResult {
    this.calls.push(input);
    if (this.shouldFail) {
      throw new Error('scanner failure');
    }
    if (this.result === null) {
      return { decision: 'pass', body: input.body };
    }
    return this.result;
  }
}

export class StubEgressTraceGateway implements EgressTraceGateway {
  readonly traces: EgressScanTrace[] = [];

  record(trace: EgressScanTrace): void {
    this.traces.push(trace);
  }
}
