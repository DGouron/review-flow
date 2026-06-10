import type {
  DaemonServiceGateway,
  DaemonStatus,
  DaemonInstallResult,
} from '@/modules/setup-wizard/entities/daemonService/daemonService.gateway.js';

interface StubOptions {
  initialStatus?: DaemonStatus;
  installResult?: DaemonInstallResult;
  healthy?: boolean;
}

export class StubDaemonServiceGateway implements DaemonServiceGateway {
  private currentStatus: DaemonStatus;
  private readonly installResult: DaemonInstallResult;
  private readonly healthy: boolean;
  public installCallCount = 0;

  constructor(options: StubOptions = {}) {
    this.currentStatus = options.initialStatus ?? { status: 'active' };
    this.installResult = options.installResult ?? {
      success: true,
      requiresSudo: false,
      error: null,
    };
    this.healthy = options.healthy ?? true;
  }

  async status(): Promise<DaemonStatus> {
    return this.currentStatus;
  }

  async install(): Promise<DaemonInstallResult> {
    this.installCallCount++;
    if (this.installResult.success) {
      this.currentStatus = { status: 'active' };
    }
    return this.installResult;
  }

  async waitUntilHealthy(_timeoutMs: number): Promise<boolean> {
    return this.healthy;
  }
}
