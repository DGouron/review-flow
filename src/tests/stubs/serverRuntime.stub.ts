import type {
  ServerRuntime,
  ServerRuntimeGateway,
} from '@/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.js';

export class StubServerRuntimeGateway implements ServerRuntimeGateway {
  constructor(public runtime: ServerRuntime) {}

  read(): ServerRuntime {
    return this.runtime;
  }
}
