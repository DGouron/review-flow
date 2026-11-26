import type { ProcessTableGateway } from '@/modules/runtime-monitoring/entities/resourceUsage/processTable.gateway.js';
import type { ProcessRecord } from '@/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.js';

export class StubProcessTableGateway implements ProcessTableGateway {
  constructor(public records: ProcessRecord[] | null = []) {}

  async read(): Promise<ProcessRecord[] | null> {
    return this.records;
  }
}
