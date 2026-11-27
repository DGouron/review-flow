import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type { RoleSessionSubject } from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';

export type RoleSessionJob = RoleSessionSubject & {
  jobId: string;
  localPath: string;
  worktreePath: string;
  roleSessions: RoleSessionRecord[];
};

export type RoleSessionJobLookup =
  | { status: 'found'; job: RoleSessionJob }
  | { status: 'not-found' }
  | { status: 'unusable'; reason: string };

export type RoleSessionRecordResult = { recorded: true } | { recorded: false; reason: string };

/** The per-job file the server writes while a review runs; role sessions are recorded in it. */
export interface RoleSessionJobGateway {
  find(jobId: string): RoleSessionJobLookup;
  recordRoleSession(jobId: string, record: RoleSessionRecord): RoleSessionRecordResult;
  /** Runs `work` while no other process launches a role session for the same job. */
  withExclusiveAccess<Result>(jobId: string, work: () => Promise<Result>): Promise<Result>;
}
