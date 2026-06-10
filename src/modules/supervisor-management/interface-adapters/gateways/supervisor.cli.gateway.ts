import { spawn } from 'node:child_process';

import type {
  SupervisorGateway,
  SupervisorProbeResult,
  SupervisorSpawnResult,
} from '@/modules/supervisor-management/entities/supervisor/supervisor.gateway.js';

export interface SupervisorProcessProbeResult {
  exitCode: number;
  stdout: string;
  timedOut: boolean;
}

export type SupervisorProcessProbe = () => Promise<SupervisorProcessProbeResult>;

export interface SupervisorProcessSpawnResult {
  pid: number | null;
  error: string | null;
}

export type SupervisorProcessSpawner = () => SupervisorProcessSpawnResult;

export interface SupervisorCliGatewayDependencies {
  probe: SupervisorProcessProbe;
  spawn: SupervisorProcessSpawner;
}

const PROBE_TIMEOUT_MS = 5000;

export function createDefaultSupervisorProbe(): SupervisorProcessProbe {
  return () =>
    new Promise<SupervisorProcessProbeResult>((resolve) => {
      const child = spawn('claude', ['agents', '--json'], { timeout: PROBE_TIMEOUT_MS });
      let stdout = '';
      let timedOut = false;

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.on('error', () => {
        resolve({ exitCode: -1, stdout, timedOut });
      });

      child.on('close', (code, signal) => {
        if (signal === 'SIGTERM') {
          timedOut = true;
        }
        resolve({
          exitCode: code ?? -1,
          stdout,
          timedOut,
        });
      });
    });
}

export function createDefaultSupervisorSpawner(): SupervisorProcessSpawner {
  return () => {
    try {
      const child = spawn('claude', ['agents'], {
        detached: true,
        stdio: 'ignore',
        cwd: process.env.HOME ?? '/',
      });
      child.unref();
      return { pid: child.pid ?? null, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown spawn error';
      return { pid: null, error: message };
    }
  };
}

export class SupervisorCliGateway implements SupervisorGateway {
  constructor(private readonly deps: SupervisorCliGatewayDependencies) {}

  async probe(): Promise<SupervisorProbeResult> {
    const probeResult = await this.deps.probe();

    if (probeResult.timedOut) {
      return { state: 'down', reason: `probe timeout after ${PROBE_TIMEOUT_MS}ms` };
    }

    if (probeResult.exitCode !== 0) {
      return {
        state: 'down',
        reason: `claude agents --json exited with code ${probeResult.exitCode}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(probeResult.stdout);
    } catch {
      return { state: 'down', reason: 'invalid JSON returned by claude agents --json' };
    }

    if (!Array.isArray(parsed)) {
      return { state: 'down', reason: 'claude agents --json did not return a JSON array' };
    }

    return { state: 'up', reason: null };
  }

  async spawnDetached(): Promise<SupervisorSpawnResult> {
    const result = this.deps.spawn();
    if (result.error !== null) {
      return { state: 'failed', pid: null, reason: result.error };
    }
    if (result.pid === null) {
      return { state: 'failed', pid: null, reason: 'spawned process returned no pid' };
    }
    return { state: 'spawned', pid: result.pid, reason: null };
  }
}
