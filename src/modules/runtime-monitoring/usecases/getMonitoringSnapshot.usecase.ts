import type {
  MonitoringSnapshot,
  ServerState,
  SessionMeasure,
} from '@/modules/runtime-monitoring/entities/monitoringSnapshot/monitoringSnapshot.js';
import type { ProcessTableGateway } from '@/modules/runtime-monitoring/entities/resourceUsage/processTable.gateway.js';
import {
  cpuPercentBetween,
  measureProcessTree,
  type CpuSample,
  type ProcessRecord,
} from '@/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.js';
import type { ServerRuntimeGateway } from '@/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.js';
import type {
  ReviewSession,
  ReviewSessionListingGateway,
} from '@/modules/runtime-monitoring/entities/reviewSession/reviewSessionListing.gateway.js';
import type { SupervisorStatusStore } from '@/modules/supervisor-management/entities/supervisor/supervisorStatusStore.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface GetMonitoringSnapshotDependencies {
  serverRuntime: ServerRuntimeGateway;
  processTable: ProcessTableGateway;
  reviewSessionListing: ReviewSessionListingGateway;
  supervisorStatusStore: SupervisorStatusStore;
  version: string;
}

/**
 * Builds the Monitoring view snapshot. CPU usage is a delta, so the instance keeps the previous
 * CPU sample of the server and of each listed session between two calls.
 */
export class GetMonitoringSnapshotUseCase implements UseCase<void, Promise<MonitoringSnapshot>> {
  private previousServerSample: CpuSample | null = null;
  private previousSessionSamples = new Map<string, CpuSample>();

  constructor(private readonly dependencies: GetMonitoringSnapshotDependencies) {}

  async execute(): Promise<MonitoringSnapshot> {
    const runtime = this.dependencies.serverRuntime.read();
    const [sessions, processes] = await Promise.all([
      this.dependencies.reviewSessionListing.list(),
      this.dependencies.processTable.read(),
    ]);

    const serverSample = {
      cpuTimeMilliseconds: runtime.cpuTimeMilliseconds,
      sampledAtMilliseconds: runtime.sampledAtMilliseconds,
    };
    const serverCpuPercent = cpuPercentBetween(this.previousServerSample, serverSample);
    this.previousServerSample = serverSample;

    return {
      sampledAt: new Date(runtime.sampledAtMilliseconds).toISOString(),
      server: this.serverState(runtime.uptimeSeconds),
      process: { pid: runtime.pid, memory: runtime.memory, cpuPercent: serverCpuPercent },
      host: runtime.host,
      sessions: {
        available: sessions !== null,
        resourcesAvailable: processes !== null,
        items: this.measureSessions(sessions ?? [], processes, runtime.sampledAtMilliseconds),
      },
    };
  }

  private serverState(uptimeSeconds: number): ServerState {
    const supervisor = this.dependencies.supervisorStatusStore.read();
    const neverChecked = supervisor.lastCheckedAt.getTime() === 0;
    return {
      status: supervisor.state === 'down' ? 'degraded' : 'ok',
      uptimeSeconds: Math.floor(uptimeSeconds),
      version: this.dependencies.version,
      supervisor: {
        state: supervisor.state,
        reason: supervisor.reason,
        lastCheckedAt: neverChecked ? null : supervisor.lastCheckedAt.toISOString(),
      },
    };
  }

  private measureSessions(
    sessions: ReviewSession[],
    processes: ProcessRecord[] | null,
    sampledAtMilliseconds: number,
  ): SessionMeasure[] {
    const nextSamples = new Map<string, CpuSample>();
    const measures = sessions.map((session) => {
      const tree = processes ? measureProcessTree(session.mainPid, processes) : null;
      const base = {
        sessionId: session.sessionId,
        worktree: session.worktree,
        startedAt: session.startedAt,
      };
      if (!tree) return { ...base, processCount: 0, memoryBytes: null, cpuPercent: null };

      const sample = { cpuTimeMilliseconds: tree.cpuTimeMilliseconds, sampledAtMilliseconds };
      const previous = this.previousSessionSamples.get(session.sessionId) ?? null;
      nextSamples.set(session.sessionId, sample);
      return {
        ...base,
        processCount: tree.processCount,
        memoryBytes: tree.memoryBytes,
        cpuPercent: cpuPercentBetween(previous, sample),
      };
    });
    this.previousSessionSamples = nextSamples;
    return measures;
  }
}
