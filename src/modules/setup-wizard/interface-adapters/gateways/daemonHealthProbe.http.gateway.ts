import type {
  DaemonHealthProbeGateway,
  DaemonHealthPingResult,
} from '@/modules/setup-wizard/entities/daemonHealthProbe/daemonHealthProbe.gateway.js';

interface DaemonHealthProbeHttpGatewayDependencies {
  fetchImpl?: typeof fetch;
}

export class DaemonHealthProbeHttpGateway implements DaemonHealthProbeGateway {
  private readonly fetchImpl: typeof fetch;

  constructor(deps: DaemonHealthProbeHttpGatewayDependencies = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async ping(port: number, timeoutMs: number): Promise<DaemonHealthPingResult> {
    const url = `http://127.0.0.1:${port}/health`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        return { healthy: false, latencyMs: null };
      }
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: null };
    } finally {
      clearTimeout(timer);
    }
  }
}
