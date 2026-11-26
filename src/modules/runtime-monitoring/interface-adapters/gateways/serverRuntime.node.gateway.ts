import { freemem, loadavg, totalmem } from 'node:os';

import type {
  ServerRuntime,
  ServerRuntimeGateway,
} from '@/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.js';

export class ServerRuntimeNodeGateway implements ServerRuntimeGateway {
  constructor(private readonly nowMilliseconds: () => number = Date.now) {}

  read(): ServerRuntime {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const [oneMinute, fiveMinutes, fifteenMinutes] = loadavg();
    return {
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      cpuTimeMilliseconds: (cpu.user + cpu.system) / 1000,
      sampledAtMilliseconds: this.nowMilliseconds(),
      host: {
        loadAverage: { oneMinute, fiveMinutes, fifteenMinutes },
        totalMemoryBytes: totalmem(),
        freeMemoryBytes: freemem(),
      },
    };
  }
}
