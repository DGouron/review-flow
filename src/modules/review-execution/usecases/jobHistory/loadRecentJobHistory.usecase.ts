import type { Logger } from 'pino';

import type { JobHistoryGateway } from '@/modules/review-execution/entities/job/jobHistory.gateway.js';
import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';

export interface LoadRecentJobHistoryDependencies {
  jobHistoryGateway: JobHistoryGateway;
  logger: Logger;
}

export interface LoadRecentJobHistoryInput {
  retentionDays: number;
  now: () => Date;
}

export class LoadRecentJobHistoryUseCase {
  constructor(private readonly deps: LoadRecentJobHistoryDependencies) {}

  async execute(input: LoadRecentJobHistoryInput): Promise<JobRecord[]> {
    const records = await this.deps.jobHistoryGateway.loadRecordsWithinWindow(
      input.retentionDays,
      input.now(),
    );
    return [...records].toSorted((left, right) =>
      right.completedAt.localeCompare(left.completedAt),
    );
  }
}
