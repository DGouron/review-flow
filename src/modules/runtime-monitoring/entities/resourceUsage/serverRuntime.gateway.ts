export type ProcessMemory = {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
};

export type HostResources = {
  loadAverage: { oneMinute: number; fiveMinutes: number; fifteenMinutes: number };
  totalMemoryBytes: number;
  freeMemoryBytes: number;
};

export type ServerRuntime = {
  pid: number;
  uptimeSeconds: number;
  memory: ProcessMemory;
  cpuTimeMilliseconds: number;
  sampledAtMilliseconds: number;
  host: HostResources;
};

export interface ServerRuntimeGateway {
  read(): ServerRuntime;
}
