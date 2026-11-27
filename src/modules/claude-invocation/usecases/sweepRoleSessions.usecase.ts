import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import type { RecordedRoleSession } from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import {
  isRoleSession,
  roleSessionAgeLimitMs,
  sweepVerdictOf,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionSweep.js';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';
import type { RoleSessionCleanupDependencies } from '@/modules/claude-invocation/usecases/endRoleSession.usecase.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface SweepRoleSessionsDependencies extends RoleSessionCleanupDependencies {
  reviewTimeoutMs: () => number;
}

export type SweepAction = 'removed' | 'would-remove' | 'kept' | 'failed';

export type SweepOutcome = {
  sessionId: SessionId;
  name: string | null;
  action: SweepAction;
  reason: string;
};

export type SweepRoleSessionsResult =
  | { status: 'swept'; outcomes: SweepOutcome[] }
  | { status: 'failed'; reason: string };

export class SweepRoleSessionsUseCase implements UseCase<
  { dryRun: boolean },
  Promise<SweepRoleSessionsResult>
> {
  constructor(private readonly dependencies: SweepRoleSessionsDependencies) {}

  async execute(input: { dryRun: boolean }): Promise<SweepRoleSessionsResult> {
    const { roleSessionGateway, roleSessionJobGateway, worktreeRoot } = this.dependencies;
    const listing = await roleSessionGateway.listBackgroundSessions();
    if (listing.status === 'failed') {
      return { status: 'failed', reason: `cannot list Claude sessions: ${listing.reason}` };
    }
    const recorded = new Map<string, RecordedRoleSession>(
      roleSessionJobGateway
        .listRecordedRoleSessions()
        .map((recordedSession) => [recordedSession.record.sessionId, recordedSession]),
    );
    const recordedIds = new Set(recorded.keys());
    const roleSessions = listing.sessions.filter((session) =>
      isRoleSession(session, { worktreeRoot, recordedIds }),
    );
    const outcomes: SweepOutcome[] = [];
    for (const session of roleSessions) {
      outcomes.push(
        await this.sweep(session, recorded.get(session.sessionId) ?? null, input.dryRun),
      );
    }
    return { status: 'swept', outcomes };
  }

  private async sweep(
    session: BackgroundSession,
    recorded: RecordedRoleSession | null,
    dryRun: boolean,
  ): Promise<SweepOutcome> {
    const verdict = sweepVerdictOf({
      activeJobId: recorded?.jobId ?? null,
      startedAt: session.startedAt ?? launchTimeOf(recorded),
      now: this.dependencies.now(),
      maxAgeMs: roleSessionAgeLimitMs(this.dependencies.reviewTimeoutMs()),
    });
    const outcome = { sessionId: session.sessionId, name: session.name, reason: verdict.reason };
    if (!verdict.remove) return { ...outcome, action: 'kept' };
    if (dryRun) return { ...outcome, action: 'would-remove' };
    const cleanup = await cleanupClaudeSession(
      { sessionId: session.sessionId },
      { sessionGateway: this.dependencies.sessionGateway },
    );
    if (cleanup.removed) return { ...outcome, action: 'removed' };
    const removeWarnings = cleanup.warnings.filter((warning) => warning.startsWith('remove'));
    return { ...outcome, action: 'failed', reason: [verdict.reason, ...removeWarnings].join('; ') };
  }
}

function launchTimeOf(recorded: RecordedRoleSession | null): Date | null {
  if (recorded === null) return null;
  const launchedAt = new Date(recorded.record.launchedAt);
  return Number.isNaN(launchedAt.getTime()) ? null : launchedAt;
}
