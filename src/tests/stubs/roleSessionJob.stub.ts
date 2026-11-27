import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type {
  RecordedRoleSession,
  RoleSessionJob,
  RoleSessionJobGateway,
  RoleSessionJobLookup,
  RoleSessionRecordResult,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import { EndJobRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/endJobRoleSessions.usecase.js';

/** Ends the role sessions of a job that never launched any. */
export function endJobWithoutRoleSessions(
  sessionGateway: ClaudeSessionGateway,
): EndJobRoleSessionsUseCase {
  return new EndJobRoleSessionsUseCase({
    roleSessionJobGateway: new InMemoryRoleSessionJobGateway(),
    sessionGateway,
    recordRoleSessionUsage: async () => {},
    reportWarnings: () => {},
  });
}

export class InMemoryRoleSessionJobGateway implements RoleSessionJobGateway {
  private readonly jobs = new Map<string, RoleSessionJob>();
  private readonly unusableJobs = new Map<string, string>();
  private recordFailure: string | null = null;
  private exclusiveAccessFailure: string | null = null;
  private readonly lockedJobIds = new Set<string>();
  closedUnderLock: string[] = [];

  save(job: RoleSessionJob): void {
    this.jobs.set(job.jobId, job);
  }

  markUnusable(jobId: string, reason: string): void {
    this.unusableJobs.set(jobId, reason);
  }

  failRecording(reason: string): void {
    this.recordFailure = reason;
  }

  recordedSessionsOf(jobId: string): RoleSessionRecord[] {
    return this.jobs.get(jobId)?.roleSessions ?? [];
  }

  find(jobId: string): RoleSessionJobLookup {
    const unusableReason = this.unusableJobs.get(jobId);
    if (unusableReason !== undefined) return { status: 'unusable', reason: unusableReason };
    const job = this.jobs.get(jobId);
    return job ? { status: 'found', job } : { status: 'not-found' };
  }

  recordRoleSession(jobId: string, record: RoleSessionRecord): RoleSessionRecordResult {
    if (this.recordFailure !== null) return { recorded: false, reason: this.recordFailure };
    const job = this.jobs.get(jobId);
    if (!job) return { recorded: false, reason: `unknown job ${jobId}` };
    this.jobs.set(jobId, { ...job, roleSessions: [...job.roleSessions, record] });
    return { recorded: true };
  }

  failExclusiveAccess(reason: string): void {
    this.exclusiveAccessFailure = reason;
  }

  listRecordedRoleSessions(): RecordedRoleSession[] {
    return [...this.jobs.values()].flatMap((job) =>
      job.roleSessions.map((record) => ({ jobId: job.jobId, record })),
    );
  }

  removeJob(jobId: string): void {
    this.jobs.delete(jobId);
  }

  closeRoleSessions(jobId: string): RoleSessionRecord[] {
    if (this.lockedJobIds.has(jobId)) this.closedUnderLock.push(jobId);
    const job = this.jobs.get(jobId);
    if (!job) return [];
    this.jobs.set(jobId, { ...job, roleSessionsClosed: true });
    return job.roleSessions;
  }

  async withExclusiveAccess<Result>(jobId: string, work: () => Promise<Result>): Promise<Result> {
    if (this.exclusiveAccessFailure !== null) throw new Error(this.exclusiveAccessFailure);
    this.lockedJobIds.add(jobId);
    try {
      return await work();
    } finally {
      this.lockedJobIds.delete(jobId);
    }
  }
}
