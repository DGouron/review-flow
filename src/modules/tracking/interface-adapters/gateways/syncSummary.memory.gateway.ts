import type { SyncSummaryGateway } from '@/modules/tracking/entities/platformSync/syncSummary.gateway.js';
import type { SyncSummary } from '@/modules/tracking/entities/platformSync/syncSummary.js';

export class InMemorySyncSummaryGateway implements SyncSummaryGateway {
  private readonly summaries = new Map<string, SyncSummary>();

  save(localPath: string, summary: SyncSummary): void {
    this.summaries.set(localPath, summary);
  }

  get(localPath: string): SyncSummary | null {
    return this.summaries.get(localPath) ?? null;
  }
}
