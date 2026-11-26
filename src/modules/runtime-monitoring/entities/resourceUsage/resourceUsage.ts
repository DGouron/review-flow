export type ProcessRecord = {
  pid: number;
  parentPid: number;
  cpuTimeMilliseconds: number;
  memoryBytes: number;
};

export type CpuSample = {
  cpuTimeMilliseconds: number;
  sampledAtMilliseconds: number;
};

export type ProcessTreeUsage = {
  processCount: number;
  memoryBytes: number;
  cpuTimeMilliseconds: number;
};

function childrenByParent(processes: ProcessRecord[]): Map<number, ProcessRecord[]> {
  const children = new Map<number, ProcessRecord[]>();
  for (const record of processes) {
    if (record.parentPid === record.pid) continue;
    const siblings = children.get(record.parentPid) ?? [];
    siblings.push(record);
    children.set(record.parentPid, siblings);
  }
  return children;
}

export function measureProcessTree(
  rootPid: number,
  processes: ProcessRecord[],
): ProcessTreeUsage | null {
  const root = processes.find((record) => record.pid === rootPid);
  if (!root) return null;

  const children = childrenByParent(processes);
  const visited = new Set<number>();
  const pending: ProcessRecord[] = [root];
  const usage: ProcessTreeUsage = { processCount: 0, memoryBytes: 0, cpuTimeMilliseconds: 0 };

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current.pid)) continue;
    visited.add(current.pid);
    usage.processCount += 1;
    usage.memoryBytes += current.memoryBytes;
    usage.cpuTimeMilliseconds += current.cpuTimeMilliseconds;
    pending.push(...(children.get(current.pid) ?? []));
  }
  return usage;
}

export function cpuPercentBetween(previous: CpuSample | null, current: CpuSample): number | null {
  if (!previous) return null;
  const elapsedMilliseconds = current.sampledAtMilliseconds - previous.sampledAtMilliseconds;
  if (elapsedMilliseconds <= 0) return null;
  const consumedMilliseconds = Math.max(
    0,
    current.cpuTimeMilliseconds - previous.cpuTimeMilliseconds,
  );
  return Math.round((consumedMilliseconds / elapsedMilliseconds) * 1000) / 10;
}
