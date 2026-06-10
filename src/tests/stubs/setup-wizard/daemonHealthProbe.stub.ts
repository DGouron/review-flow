import type {
  DaemonHealthProbeGateway,
  DaemonHealthPingResult,
} from '@/modules/setup-wizard/entities/daemonHealthProbe/daemonHealthProbe.gateway.js';

interface StubOptions {
  healthy?: boolean;
  latencyMs?: number;
}

export class StubDaemonHealthProbeGateway implements DaemonHealthProbeGateway {
  private readonly healthy: boolean;
  private readonly latencyMs: number;

  constructor(options: StubOptions = {}) {
    this.healthy = options.healthy ?? true;
    this.latencyMs = options.latencyMs ?? 5;
  }

  async ping(_port: number, _timeoutMs: number): Promise<DaemonHealthPingResult> {
    return { healthy: this.healthy, latencyMs: this.healthy ? this.latencyMs : null };
  }
}
