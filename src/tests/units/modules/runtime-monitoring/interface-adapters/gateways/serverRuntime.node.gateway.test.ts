import { describe, expect, it } from 'vitest';

import { ServerRuntimeNodeGateway } from '@/modules/runtime-monitoring/interface-adapters/gateways/serverRuntime.node.gateway.js';

describe('ServerRuntimeNodeGateway', () => {
  it('measures the current process and its host', () => {
    const runtime = new ServerRuntimeNodeGateway(() => 1_700_000_000_000).read();

    expect(runtime.pid).toBe(process.pid);
    expect(runtime.sampledAtMilliseconds).toBe(1_700_000_000_000);
    expect(runtime.uptimeSeconds).toBeGreaterThan(0);
    expect(runtime.memory.rssBytes).toBeGreaterThan(0);
    expect(runtime.memory.heapUsedBytes).toBeGreaterThan(0);
    expect(runtime.memory.heapTotalBytes).toBeGreaterThanOrEqual(runtime.memory.heapUsedBytes);
    expect(runtime.cpuTimeMilliseconds).toBeGreaterThan(0);
    expect(runtime.host.totalMemoryBytes).toBeGreaterThanOrEqual(runtime.host.freeMemoryBytes);
    expect(Object.keys(runtime.host.loadAverage)).toEqual([
      'oneMinute',
      'fiveMinutes',
      'fifteenMinutes',
    ]);
  });

  it('reports a growing CPU time between two reads', () => {
    const gateway = new ServerRuntimeNodeGateway(() => Date.now());
    const first = gateway.read().cpuTimeMilliseconds;
    let busy = 0;
    for (let iteration = 0; iteration < 2_000_000; iteration += 1) busy += iteration;

    expect(busy).toBeGreaterThan(0);
    expect(gateway.read().cpuTimeMilliseconds).toBeGreaterThan(first);
  });
});
