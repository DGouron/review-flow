import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { RoleSessionGateway } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import type { RoleSessionJobGateway } from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import { isRoleSession } from '@/modules/claude-invocation/entities/roleSession/roleSessionSweep.js';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface RoleSessionCleanupDependencies {
  roleSessionGateway: RoleSessionGateway;
  roleSessionJobGateway: RoleSessionJobGateway;
  sessionGateway: ClaudeSessionGateway;
  worktreeRoot: string;
  now: () => Date;
}

export type EndRoleSessionResult =
  | { status: 'removed'; name: string }
  | { status: 'already-gone' }
  | { status: 'failed'; reason: string };

export class EndRoleSessionUseCase implements UseCase<
  { sessionId: string },
  Promise<EndRoleSessionResult>
> {
  constructor(private readonly dependencies: RoleSessionCleanupDependencies) {}

  async execute(input: { sessionId: string }): Promise<EndRoleSessionResult> {
    const { roleSessionGateway, roleSessionJobGateway, worktreeRoot } = this.dependencies;
    const listing = await roleSessionGateway.listBackgroundSessions();
    if (listing.status === 'failed') {
      return { status: 'failed', reason: `cannot list Claude sessions: ${listing.reason}` };
    }
    const session = listing.sessions.find((candidate) => candidate.sessionId === input.sessionId);
    if (!session) return { status: 'already-gone' };
    const recordedIds = new Set<string>(
      roleSessionJobGateway.listRecordedRoleSessions().map(({ record }) => record.sessionId),
    );
    const label = session.name ?? session.sessionId;
    if (!isRoleSession(session, { worktreeRoot, recordedIds })) {
      return {
        status: 'failed',
        reason: `session ${session.sessionId} (${label}) is not a role session`,
      };
    }
    return this.remove(session.sessionId, label);
  }

  private async remove(sessionId: SessionId, label: string): Promise<EndRoleSessionResult> {
    const cleanup = await cleanupClaudeSession(
      { sessionId },
      { sessionGateway: this.dependencies.sessionGateway },
    );
    if (cleanup.removed) return { status: 'removed', name: label };
    const removeWarnings = cleanup.warnings.filter((warning) => warning.startsWith('remove'));
    return { status: 'failed', reason: `${label} not removed: ${removeWarnings.join('; ')}` };
  }
}
