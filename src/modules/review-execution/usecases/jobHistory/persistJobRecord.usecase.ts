import type { Logger } from 'pino';

import type { JobHistoryGateway } from '@/modules/review-execution/entities/job/jobHistory.gateway.js';
import type {
  JobRecord,
  JobRecordStatus,
} from '@/modules/review-execution/entities/job/jobRecord.schema.js';
import type { JobStatus } from '@/modules/review-execution/entities/job/reviewJob.js';

export interface PersistJobRecordDependencies {
  jobHistoryGateway: JobHistoryGateway;
  logger: Logger;
}

export interface PersistJobRecordInput {
  jobStatus: JobStatus;
  abortSignalAborted: boolean;
  now: () => Date;
}

const CANCEL_PATTERN = /aborted|cancel|annul/i;
const TIMEOUT_PATTERN = /timeout/i;

function mapStatus(jobStatus: JobStatus, abortSignalAborted: boolean): JobRecordStatus {
  if (jobStatus.status === 'completed' && !abortSignalAborted) {
    return 'success';
  }
  const error = jobStatus.error ?? '';
  if (abortSignalAborted || CANCEL_PATTERN.test(error)) {
    return 'killed';
  }
  if (TIMEOUT_PATTERN.test(error)) {
    return 'timeout';
  }
  return 'failed';
}

function toIso(date: Date | undefined, fallback: Date): string {
  if (date) {
    return date.toISOString();
  }
  return fallback.toISOString();
}

function buildRecord(input: PersistJobRecordInput): JobRecord {
  const { jobStatus, abortSignalAborted, now } = input;
  const completedAtDate = jobStatus.completedAt ?? now();
  const startedAtDate = jobStatus.startedAt ?? completedAtDate;
  const durationMs = Math.max(0, completedAtDate.getTime() - startedAtDate.getTime());
  const status = mapStatus(jobStatus, abortSignalAborted);
  const exitReason = jobStatus.error && jobStatus.error.length > 0 ? jobStatus.error : null;

  return {
    jobId: jobStatus.job.id,
    platform: jobStatus.job.platform,
    projectPath: jobStatus.job.projectPath,
    mergeRequestId: jobStatus.job.mrNumber,
    jobType: jobStatus.job.jobType ?? 'review',
    startedAt: toIso(jobStatus.startedAt, completedAtDate),
    completedAt: toIso(jobStatus.completedAt, now()),
    durationMs,
    status,
    exitReason,
  };
}

export class PersistJobRecordUseCase {
  constructor(private readonly deps: PersistJobRecordDependencies) {}

  async execute(input: PersistJobRecordInput): Promise<void> {
    const record = buildRecord(input);
    try {
      await this.deps.jobHistoryGateway.appendRecord(record);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.logger.warn(
        { jobId: record.jobId, error: reason },
        `Échec persistance job ${record.jobId} : ${reason}`,
      );
    }
  }
}
