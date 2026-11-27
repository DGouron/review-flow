import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';
import type { ReviewRole } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';
import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type { RoleSessionJobGateway } from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export type RoleSessionUsage = { role: ReviewRole; snapshot: SessionUsageSnapshot };

export interface EndJobRoleSessionsDependencies {
  roleSessionJobGateway: RoleSessionJobGateway;
  sessionGateway: ClaudeSessionGateway;
  recordRoleSessionUsage: (usage: RoleSessionUsage) => Promise<void>;
}

export interface EndJobRoleSessionsInput {
  jobId: string;
  cwd: string;
}

export type EndJobRoleSessionsResult = { ended: number; warnings: string[] };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Measures then ends every role session a job recorded. Never throws. */
export class EndJobRoleSessionsUseCase implements UseCase<
  EndJobRoleSessionsInput,
  Promise<EndJobRoleSessionsResult>
> {
  constructor(private readonly dependencies: EndJobRoleSessionsDependencies) {}

  async execute(input: EndJobRoleSessionsInput): Promise<EndJobRoleSessionsResult> {
    const result: EndJobRoleSessionsResult = { ended: 0, warnings: [] };
    for (const record of this.recordedSessionsOf(input.jobId, result.warnings)) {
      const warnings = [
        ...(await this.measure(record, input.cwd)),
        ...(await this.end(record, result)),
      ];
      result.warnings.push(...warnings.map((warning) => `${record.sessionId}: ${warning}`));
    }
    return result;
  }

  private recordedSessionsOf(jobId: string, warnings: string[]): RoleSessionRecord[] {
    try {
      return this.dependencies.roleSessionJobGateway
        .listRecordedRoleSessions()
        .filter((recorded) => recorded.jobId === jobId)
        .map((recorded) => recorded.record);
    } catch (error) {
      warnings.push(`role sessions not read: ${messageOf(error)}`);
      return [];
    }
  }

  private async measure(record: RoleSessionRecord, cwd: string): Promise<string[]> {
    let snapshot: SessionUsageSnapshot | null;
    try {
      snapshot = await this.dependencies.sessionGateway.getSessionUsage(record.sessionId, cwd);
    } catch (error) {
      return [`usage not measured: ${messageOf(error)}`];
    }
    if (snapshot === null) return [];
    try {
      await this.dependencies.recordRoleSessionUsage({ role: record.role, snapshot });
      return [];
    } catch (error) {
      return [`usage not recorded: ${messageOf(error)}`];
    }
  }

  private async end(
    record: RoleSessionRecord,
    result: EndJobRoleSessionsResult,
  ): Promise<string[]> {
    const cleanup = await cleanupClaudeSession(
      { sessionId: record.sessionId },
      { sessionGateway: this.dependencies.sessionGateway },
    );
    if (cleanup.removed) result.ended += 1;
    return cleanup.warnings;
  }
}
