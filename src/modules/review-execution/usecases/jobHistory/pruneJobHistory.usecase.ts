import type { Logger } from 'pino';

import type {
  JobHistoryGateway,
  PruneJobHistoryResult,
} from '@/modules/review-execution/entities/job/jobHistory.gateway.js';

export interface PruneJobHistoryDependencies {
  jobHistoryGateway: JobHistoryGateway;
  logger: Logger;
}

export interface PruneJobHistoryInput {
  retentionDays: number;
  now: () => Date;
}

export class PruneJobHistoryUseCase {
  constructor(private readonly deps: PruneJobHistoryDependencies) {}

  async execute(input: PruneJobHistoryInput): Promise<PruneJobHistoryResult> {
    const result = await this.deps.jobHistoryGateway.deleteRecordsOutsideWindow(
      input.retentionDays,
      input.now(),
    );
    this.deps.logger.info({ deletedCount: result.deletedFilenames.length }, 'Job history pruned');
    return result;
  }
}
