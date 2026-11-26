import type { ProcessRecord } from '@/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.js';
import type { ServerRuntime } from '@/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.js';
import type { ReviewSession } from '@/modules/runtime-monitoring/entities/reviewSession/reviewSessionListing.gateway.js';

const MEGABYTE = 1024 * 1024;

export class MonitoringFactory {
  static serverRuntime(overrides: Partial<ServerRuntime> = {}): ServerRuntime {
    return {
      pid: 1234,
      uptimeSeconds: 3600,
      memory: {
        rssBytes: 200 * MEGABYTE,
        heapUsedBytes: 80 * MEGABYTE,
        heapTotalBytes: 120 * MEGABYTE,
      },
      cpuTimeMilliseconds: 10_000,
      sampledAtMilliseconds: 1_000_000,
      host: {
        loadAverage: { oneMinute: 0.5, fiveMinutes: 0.4, fifteenMinutes: 0.3 },
        totalMemoryBytes: 8192 * MEGABYTE,
        freeMemoryBytes: 2048 * MEGABYTE,
      },
      ...overrides,
    };
  }

  static processRecord(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
    return {
      pid: 4100,
      parentPid: 1,
      cpuTimeMilliseconds: 0,
      memoryBytes: 10 * MEGABYTE,
      ...overrides,
    };
  }

  static reviewSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
    return {
      sessionId: 'a1b2c3d4',
      worktree: 'github-acme-app-1526',
      mainPid: 4100,
      startedAt: '2026-11-26T09:00:00.000Z',
      ...overrides,
    };
  }
}
