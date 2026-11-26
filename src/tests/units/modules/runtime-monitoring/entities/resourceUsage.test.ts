import { describe, expect, it } from 'vitest';

import {
  cpuPercentBetween,
  measureProcessTree,
} from '@/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.js';
import { MonitoringFactory } from '@/tests/factories/monitoring.factory.js';

describe('measureProcessTree', () => {
  const processes = [
    MonitoringFactory.processRecord({
      pid: 1,
      parentPid: 0,
      cpuTimeMilliseconds: 99,
      memoryBytes: 99,
    }),
    MonitoringFactory.processRecord({
      pid: 10,
      parentPid: 1,
      cpuTimeMilliseconds: 100,
      memoryBytes: 1000,
    }),
    MonitoringFactory.processRecord({
      pid: 11,
      parentPid: 10,
      cpuTimeMilliseconds: 20,
      memoryBytes: 200,
    }),
    MonitoringFactory.processRecord({
      pid: 12,
      parentPid: 11,
      cpuTimeMilliseconds: 3,
      memoryBytes: 30,
    }),
    MonitoringFactory.processRecord({
      pid: 20,
      parentPid: 1,
      cpuTimeMilliseconds: 7,
      memoryBytes: 70,
    }),
  ];

  it('sums the root process and all its descendants', () => {
    expect(measureProcessTree(10, processes)).toEqual({
      processCount: 3,
      memoryBytes: 1230,
      cpuTimeMilliseconds: 123,
    });
  });

  it('measures a lone process', () => {
    expect(measureProcessTree(20, processes)).toEqual({
      processCount: 1,
      memoryBytes: 70,
      cpuTimeMilliseconds: 7,
    });
  });

  it('returns null when the root process is gone', () => {
    expect(measureProcessTree(42, processes)).toBeNull();
  });

  it('does not loop on a process that claims to be its own parent', () => {
    const selfParent = [MonitoringFactory.processRecord({ pid: 5, parentPid: 5, memoryBytes: 10 })];

    expect(measureProcessTree(5, selfParent)?.processCount).toBe(1);
  });
});

describe('cpuPercentBetween', () => {
  it('is unknown without a previous sample', () => {
    expect(
      cpuPercentBetween(null, { cpuTimeMilliseconds: 500, sampledAtMilliseconds: 1000 }),
    ).toBeNull();
  });

  it('is the CPU time consumed over the elapsed time, in percent of one core', () => {
    expect(
      cpuPercentBetween(
        { cpuTimeMilliseconds: 1000, sampledAtMilliseconds: 10_000 },
        { cpuTimeMilliseconds: 1500, sampledAtMilliseconds: 11_000 },
      ),
    ).toBe(50);
  });

  it('can exceed 100 percent on several cores', () => {
    expect(
      cpuPercentBetween(
        { cpuTimeMilliseconds: 0, sampledAtMilliseconds: 0 },
        { cpuTimeMilliseconds: 2000, sampledAtMilliseconds: 1000 },
      ),
    ).toBe(200);
  });

  it('rounds to one decimal', () => {
    expect(
      cpuPercentBetween(
        { cpuTimeMilliseconds: 0, sampledAtMilliseconds: 0 },
        { cpuTimeMilliseconds: 1, sampledAtMilliseconds: 3 },
      ),
    ).toBe(33.3);
  });

  it('is unknown when no time elapsed', () => {
    const sample = { cpuTimeMilliseconds: 10, sampledAtMilliseconds: 10 };

    expect(cpuPercentBetween(sample, sample)).toBeNull();
  });

  it('never goes negative when the CPU counter went backwards', () => {
    expect(
      cpuPercentBetween(
        { cpuTimeMilliseconds: 500, sampledAtMilliseconds: 0 },
        { cpuTimeMilliseconds: 100, sampledAtMilliseconds: 1000 },
      ),
    ).toBe(0);
  });
});
