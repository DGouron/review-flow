import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';
import type { ReviewRole } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';
import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type { RoleSessionJobGateway } from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export type RoleSessionUsage = { role: ReviewRole; snapshot: SessionUsageSnapshot };

export interface EndJobRoleSessionsDependencies {
  roleSessionJobGateway: RoleSessionJobGateway;
  sessionGateway: ClaudeSessionGateway;
  recordRoleSessionUsage: (usage: RoleSessionUsage) => Promise<void>;
  reportWarnings: (warnings: string[]) => void;
}

export interface EndJobRoleSessionsInput {
  jobId: string;
  cwd: string;
}

export type EndJobRoleSessionsResult = { ended: number; warnings: string[] };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Stops, measures, then removes every role session a job recorded. Never throws. */
export class EndJobRoleSessionsUseCase implements UseCase<
  EndJobRoleSessionsInput,
  Promise<EndJobRoleSessionsResult>
> {
  constructor(private readonly dependencies: EndJobRoleSessionsDependencies) {}

  async execute(input: EndJobRoleSessionsInput): Promise<EndJobRoleSessionsResult> {
    const result: EndJobRoleSessionsResult = { ended: 0, warnings: [] };
    try {
      await this.endAll(input, result);
    } catch (error) {
      result.warnings.push(`role sessions not all ended: ${messageOf(error)}`);
    }
    this.report(result.warnings);
    return result;
  }

  private async endAll(
    input: EndJobRoleSessionsInput,
    result: EndJobRoleSessionsResult,
  ): Promise<void> {
    for (const record of await this.closeRoleSessions(input.jobId, result.warnings)) {
      const warnings = [
        ...(await this.stop(record)),
        ...(await this.measure(record, input.cwd)),
        ...(await this.remove(record, result)),
      ];
      result.warnings.push(...warnings.map((warning) => `${record.sessionId}: ${warning}`));
    }
  }

  private report(warnings: string[]): void {
    if (warnings.length === 0) return;
    try {
      this.dependencies.reportWarnings(warnings);
    } catch {
      return;
    }
  }

  /** Under the job lock, so no launch can slip a role session in once the job ends. */
  private async closeRoleSessions(jobId: string, warnings: string[]): Promise<RoleSessionRecord[]> {
    const { roleSessionJobGateway } = this.dependencies;
    try {
      return await roleSessionJobGateway.withExclusiveAccess(jobId, async () =>
        roleSessionJobGateway.closeRoleSessions(jobId),
      );
    } catch (error) {
      warnings.push(`role sessions closed without the job lock: ${messageOf(error)}`);
    }
    try {
      return roleSessionJobGateway.closeRoleSessions(jobId);
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

  private async stop(record: RoleSessionRecord): Promise<string[]> {
    try {
      const stopped = await this.dependencies.sessionGateway.stop(record.sessionId);
      return stopped.success || stopped.warning === null ? [] : [`stop: ${stopped.warning}`];
    } catch (error) {
      return [`stop failed: ${messageOf(error)}`];
    }
  }

  private async remove(
    record: RoleSessionRecord,
    result: EndJobRoleSessionsResult,
  ): Promise<string[]> {
    try {
      const removed = await this.dependencies.sessionGateway.remove(record.sessionId);
      if (removed.success) result.ended += 1;
      return removed.success || removed.warning === null ? [] : [`remove: ${removed.warning}`];
    } catch (error) {
      return [`remove failed: ${messageOf(error)}`];
    }
  }
}
