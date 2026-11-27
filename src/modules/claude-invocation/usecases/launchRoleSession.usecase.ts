import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  MAX_LIVE_ROLE_SESSIONS_PER_JOB,
  modelForRole,
  type ReviewOrchestrationSettings,
} from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';
import {
  isReviewRole,
  REVIEW_ROLES,
  type ReviewRole,
} from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';
import type { RoleSessionGateway } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import type {
  RoleSessionJob,
  RoleSessionJobGateway,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import { roleSessionNameOf } from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface LaunchRoleSessionInput {
  role: string;
  brief: string | null;
  jobId: string;
}

export type LaunchRoleSessionResult =
  | { status: 'launched'; sessionId: SessionId; name: string }
  | { status: 'refused'; reason: string };

export interface LaunchRoleSessionDependencies {
  roleSessionGateway: RoleSessionGateway;
  roleSessionJobGateway: RoleSessionJobGateway;
  sessionGateway: ClaudeSessionGateway;
  reviewSettingsOf: (localPath: string) => ReviewOrchestrationSettings | null;
  now: () => Date;
}

type ValidatedLaunch = { role: ReviewRole; brief: string; jobId: string };

function refused(reason: string): LaunchRoleSessionResult {
  return { status: 'refused', reason };
}

function validate(input: LaunchRoleSessionInput): ValidatedLaunch | { refusal: string } {
  if (!isReviewRole(input.role)) {
    return { refusal: `unknown role "${input.role}" (expected ${REVIEW_ROLES.join(', ')})` };
  }
  if (input.brief === null || input.brief.trim().length === 0) {
    return { refusal: 'brief is missing or empty' };
  }
  return { role: input.role, brief: input.brief, jobId: input.jobId };
}

export class LaunchRoleSessionUseCase implements UseCase<
  LaunchRoleSessionInput,
  Promise<LaunchRoleSessionResult>
> {
  constructor(private readonly dependencies: LaunchRoleSessionDependencies) {}

  async execute(input: LaunchRoleSessionInput): Promise<LaunchRoleSessionResult> {
    const launch = validate(input);
    if ('refusal' in launch) return refused(launch.refusal);
    try {
      return await this.dependencies.roleSessionJobGateway.withExclusiveAccess(launch.jobId, () =>
        this.launchForJob(launch),
      );
    } catch (error) {
      return refused(error instanceof Error ? error.message : String(error));
    }
  }

  private async launchForJob(launch: ValidatedLaunch): Promise<LaunchRoleSessionResult> {
    const lookup = this.dependencies.roleSessionJobGateway.find(launch.jobId);
    if (lookup.status === 'not-found') return refused(`unknown job ${launch.jobId}`);
    if (lookup.status === 'unusable') return refused(lookup.reason);
    const capRefusal = await this.capRefusalOf(lookup.job);
    if (capRefusal !== null) return refused(capRefusal);
    return this.dispatchAndRecord(lookup.job, launch);
  }

  private async capRefusalOf(job: RoleSessionJob): Promise<string | null> {
    const listing = await this.dependencies.roleSessionGateway.listBackgroundSessions();
    if (listing.status === 'failed') return `cannot count live role sessions: ${listing.reason}`;
    const listedIds = new Set<string>(listing.sessions.map((session) => session.sessionId));
    const liveCount = job.roleSessions.filter((record) => listedIds.has(record.sessionId)).length;
    if (liveCount < MAX_LIVE_ROLE_SESSIONS_PER_JOB) return null;
    return `job ${job.jobId} already has ${liveCount} live role sessions (cap ${MAX_LIVE_ROLE_SESSIONS_PER_JOB})`;
  }

  private async dispatchAndRecord(
    job: RoleSessionJob,
    launch: ValidatedLaunch,
  ): Promise<LaunchRoleSessionResult> {
    const { roleSessionGateway, roleSessionJobGateway, reviewSettingsOf, now } = this.dependencies;
    const name = roleSessionNameOf(job, launch.role);
    const dispatch = await roleSessionGateway.launch({
      name,
      model: modelForRole(reviewSettingsOf(job.localPath), launch.role),
      brief: launch.brief,
      cwd: job.worktreePath,
    });
    if (dispatch.status !== 'dispatched') {
      return refused(`dispatch ${dispatch.status}: ${dispatch.rawStderr.trim()}`);
    }
    const recording = roleSessionJobGateway.recordRoleSession(job.jobId, {
      sessionId: dispatch.sessionId,
      role: launch.role,
      launchedAt: now().toISOString(),
    });
    if (!recording.recorded) return this.endUntrackedSession(dispatch.sessionId, recording.reason);
    return { status: 'launched', sessionId: dispatch.sessionId, name };
  }

  private async endUntrackedSession(
    sessionId: SessionId,
    reason: string,
  ): Promise<LaunchRoleSessionResult> {
    await cleanupClaudeSession({ sessionId }, { sessionGateway: this.dependencies.sessionGateway });
    return refused(
      `session ${sessionId} could not be recorded (${reason}); it was stopped and removed`,
    );
  }
}
