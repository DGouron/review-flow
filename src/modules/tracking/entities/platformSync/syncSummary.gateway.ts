import type { SyncSummary } from '@/modules/tracking/entities/platformSync/syncSummary.js';

export interface SyncSummaryGateway {
  save(localPath: string, summary: SyncSummary): void;
  get(localPath: string): SyncSummary | null;
}
