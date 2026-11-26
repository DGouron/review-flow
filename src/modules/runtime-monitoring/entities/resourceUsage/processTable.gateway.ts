import type { ProcessRecord } from '@/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.js';

export interface ProcessTableGateway {
  /** Every process of the machine, or `null` when the OS cannot report per-process resources. */
  read(): Promise<ProcessRecord[] | null>;
}
