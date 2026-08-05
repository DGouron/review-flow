import { getQueueStats } from '@/frameworks/queue/pQueueAdapter.js';
import type { QueueActivityGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.js';

type QueueStatsReader = () => { size: number; pending: number; recentJobs: number };

export class QueueActivityPQueueGateway implements QueueActivityGateway {
  private readonly readStats: QueueStatsReader;

  constructor(readStats: QueueStatsReader = getQueueStats) {
    this.readStats = readStats;
  }

  countActiveOrWaiting(): number {
    const { size, pending } = this.readStats();
    return size + pending;
  }
}
