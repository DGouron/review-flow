import type {
  ClaudeSession,
  ClaudeSessionJobType,
  SessionId,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export interface CreateClaudeSessionInput {
  sessionId: SessionId;
  jobId: string;
  jobType: ClaudeSessionJobType;
  localPath: string;
  mergeRequestId: string;
  dispatchedAt: Date;
}

export function createClaudeSession(input: CreateClaudeSessionInput): ClaudeSession {
  return {
    sessionId: input.sessionId,
    jobId: input.jobId,
    jobType: input.jobType,
    localPath: input.localPath,
    mergeRequestId: input.mergeRequestId,
    dispatchedAt: input.dispatchedAt,
    status: 'dispatched',
    failureReason: null,
  };
}

export function markCompleted(session: ClaudeSession): ClaudeSession {
  return { ...session, status: 'completed', failureReason: null };
}

export function markFailed(session: ClaudeSession, reason: string): ClaudeSession {
  return { ...session, status: 'failed', failureReason: reason };
}

export function markTimedOut(session: ClaudeSession): ClaudeSession {
  return { ...session, status: 'timed-out', failureReason: 'timeout' };
}

export function markCleaned(session: ClaudeSession): ClaudeSession {
  return { ...session, status: 'cleaned' };
}

export function isExpired(session: ClaudeSession, now: Date, timeoutMs: number): boolean {
  const elapsed = now.getTime() - session.dispatchedAt.getTime();
  return elapsed >= timeoutMs;
}
