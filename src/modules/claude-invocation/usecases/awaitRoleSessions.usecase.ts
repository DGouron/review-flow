import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  roleSessionTimeoutMs,
  type ReviewOrchestrationSettings,
} from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';
import type { ReviewRole } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';
import type { RoleSessionGateway } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type { RoleSessionJobGateway } from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import {
  roleSessionProgressOf,
  type RoleSessionProgress,
  type RoleSessionVerdict,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionProgress.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface AwaitRoleSessionsInput {
  jobId: string;
  /** Null waits until every role session is finished or timed out. */
  maxWaitMs: number | null;
}

export type RoleSessionOutcome = {
  verdict: RoleSessionVerdict;
  role: ReviewRole;
  sessionId: SessionId;
};

export type AwaitRoleSessionsResult =
  | { status: 'awaited'; outcomes: RoleSessionOutcome[] }
  | { status: 'refused'; reason: string };

export interface AwaitRoleSessionsDependencies {
  roleSessionGateway: RoleSessionGateway;
  roleSessionJobGateway: RoleSessionJobGateway;
  sessionGateway: ClaudeSessionGateway;
  reviewSettingsOf: (localPath: string) => ReviewOrchestrationSettings | null;
  now: () => Date;
  wait: (milliseconds: number) => Promise<void>;
  pollIntervalMs: number;
}

type Progress = { record: RoleSessionRecord; progress: RoleSessionProgress; state: string | null };

type Poll = { status: 'polled'; progresses: Progress[] } | { status: 'refused'; reason: string };

function outcomesOf(progresses: Progress[]): RoleSessionOutcome[] {
  return progresses.flatMap(({ record, progress }) =>
    progress === 'running'
      ? []
      : [{ verdict: progress, role: record.role, sessionId: record.sessionId }],
  );
}

export class AwaitRoleSessionsUseCase implements UseCase<
  AwaitRoleSessionsInput,
  Promise<AwaitRoleSessionsResult>
> {
  private readonly stoppedSessionIds = new Set<string>();

  constructor(private readonly dependencies: AwaitRoleSessionsDependencies) {}

  async execute(input: AwaitRoleSessionsInput): Promise<AwaitRoleSessionsResult> {
    const { now, wait, pollIntervalMs } = this.dependencies;
    const startedAt = now().getTime();
    for (;;) {
      const poll = await this.poll(input.jobId);
      if (poll.status === 'refused') return poll;
      const outcomes = outcomesOf(poll.progresses);
      if (outcomes.length === poll.progresses.length) return { status: 'awaited', outcomes };
      const remainingMs =
        input.maxWaitMs === null ? pollIntervalMs : input.maxWaitMs - (now().getTime() - startedAt);
      if (remainingMs <= 0) return { status: 'awaited', outcomes };
      await wait(Math.min(pollIntervalMs, remainingMs));
    }
  }

  private async poll(jobId: string): Promise<Poll> {
    const lookup = this.dependencies.roleSessionJobGateway.find(jobId);
    if (lookup.status === 'not-found') return { status: 'refused', reason: `unknown job ${jobId}` };
    if (lookup.status === 'unusable') return { status: 'refused', reason: lookup.reason };
    const listing = await this.dependencies.roleSessionGateway.listBackgroundSessions();
    if (listing.status === 'failed') {
      return { status: 'refused', reason: `cannot list Claude sessions: ${listing.reason}` };
    }
    const timeoutMs = roleSessionTimeoutMs(
      this.dependencies.reviewSettingsOf(lookup.job.localPath),
    );
    const progresses = lookup.job.roleSessions.map((record) => {
      const session = listing.sessions.find((listed) => listed.sessionId === record.sessionId);
      const state = session?.state ?? null;
      const progress = roleSessionProgressOf({
        listed: session !== undefined,
        state,
        launchedAt: new Date(record.launchedAt),
        now: this.dependencies.now(),
        timeoutMs,
      });
      return { record, progress, state };
    });
    await this.stopTimedOutSessions(progresses);
    return { status: 'polled', progresses };
  }

  /** Stopped, not removed: the job still measures its tokens when it ends its role sessions. */
  private async stopTimedOutSessions(progresses: Progress[]): Promise<void> {
    const toStop = progresses.filter(
      ({ record, progress, state }) =>
        progress === 'timeout' &&
        state !== 'stopped' &&
        !this.stoppedSessionIds.has(record.sessionId),
    );
    for (const { record } of toStop) {
      this.stoppedSessionIds.add(record.sessionId);
      try {
        await this.dependencies.sessionGateway.stop(record.sessionId);
      } catch {
        // the job ends every role session when it ends: a failed stop is retried there
      }
    }
  }
}
