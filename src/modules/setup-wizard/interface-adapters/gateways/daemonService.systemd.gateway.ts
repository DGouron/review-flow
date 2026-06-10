import { execSync } from 'node:child_process';

import type { DaemonHealthProbeGateway } from '@/modules/setup-wizard/entities/daemonHealthProbe/daemonHealthProbe.gateway.js';
import type {
  DaemonServiceGateway,
  DaemonStatus,
  DaemonInstallResult,
} from '@/modules/setup-wizard/entities/daemonService/daemonService.gateway.js';

const SERVICE_NAME = 'reviewflow-app';
const POLL_INTERVAL_MS = 500;

interface DaemonServiceSystemdGatewayDependencies {
  executeCommand?: (command: string, options?: object) => Buffer | string;
  healthProbe: DaemonHealthProbeGateway;
  port: number;
  platform?: NodeJS.Platform;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DaemonServiceSystemdGateway implements DaemonServiceGateway {
  private readonly executor: (command: string, options?: object) => Buffer | string;
  private readonly healthProbe: DaemonHealthProbeGateway;
  private readonly port: number;
  private readonly platform: NodeJS.Platform;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: DaemonServiceSystemdGatewayDependencies) {
    this.executor = deps.executeCommand ?? execSync;
    this.healthProbe = deps.healthProbe;
    this.port = deps.port;
    this.platform = deps.platform ?? process.platform;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async status(): Promise<DaemonStatus> {
    if (this.platform !== 'linux') {
      return { status: 'unsupported-platform', platform: this.platform };
    }
    try {
      const output = this.executor(`systemctl is-active ${SERVICE_NAME}`, { stdio: 'pipe' });
      const value = output.toString().trim();
      if (value === 'active') return { status: 'active' };
      return { status: 'inactive' };
    } catch {
      return { status: 'not-installed' };
    }
  }

  async install(): Promise<DaemonInstallResult> {
    if (this.platform !== 'linux') {
      return {
        success: false,
        requiresSudo: false,
        error: `Plateforme ${this.platform} non supportée par systemd`,
      };
    }
    try {
      this.executor(`systemctl --user enable --now ${SERVICE_NAME}`, { stdio: 'pipe' });
      return { success: true, requiresSudo: false, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const requiresSudo =
        message.toLowerCase().includes('permission') || message.toLowerCase().includes('sudo');
      return { success: false, requiresSudo, error: message };
    }
  }

  async waitUntilHealthy(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const probe = await this.healthProbe.ping(this.port, POLL_INTERVAL_MS);
      if (probe.healthy) return true;
      await this.sleep(POLL_INTERVAL_MS);
    }
    return false;
  }
}
