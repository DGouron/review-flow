import type {
  HostResources,
  ProcessMemory,
} from '@/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.js';
import type { SupervisorState } from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';

export type ServerState = {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  version: string;
  supervisor: { state: SupervisorState; reason: string | null; lastCheckedAt: string | null };
};

export type SessionMeasure = {
  sessionId: string;
  worktree: string;
  startedAt: string | null;
  processCount: number;
  memoryBytes: number | null;
  cpuPercent: number | null;
};

export type MonitoringSnapshot = {
  sampledAt: string;
  server: ServerState;
  process: { pid: number; memory: ProcessMemory; cpuPercent: number | null };
  host: HostResources;
  sessions: { available: boolean; resourcesAvailable: boolean; items: SessionMeasure[] };
};
