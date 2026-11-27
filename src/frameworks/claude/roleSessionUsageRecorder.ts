import type { RoleSessionUsage } from '@/modules/claude-invocation/usecases/endJobRoleSessions.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import { roleTokenUsageRecordOf } from '@/modules/token-accounting/entities/tokenUsage/tokenUsageRecordOf.js';
import type { TrackTokenUsageUseCase } from '@/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.js';

export interface RoleSessionUsageRecorderDependencies {
  job: ReviewJob;
  jobType: 'review' | 'followup';
  trackTokenUsage: Pick<TrackTokenUsageUseCase, 'execute'>;
  now: () => Date;
}

/** Writes one token usage record, carrying the role, for a role session of the job. */
export function createRoleSessionUsageRecorder(
  dependencies: RoleSessionUsageRecorderDependencies,
): (usage: RoleSessionUsage) => Promise<void> {
  const { job, jobType, trackTokenUsage, now } = dependencies;
  return async ({ role, snapshot }) => {
    await trackTokenUsage.execute(
      roleTokenUsageRecordOf({
        job,
        jobType,
        session: snapshot,
        role,
        recordedAt: now().toISOString(),
      }),
    );
  };
}
