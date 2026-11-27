import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import { isRoleSessionName } from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';

const MAX_ROLE_SESSION_AGE_MS = 2 * 60 * 60 * 1000;

export type RoleSessionRecognition = {
  worktreeRoot: string;
  recordedIds: ReadonlySet<string>;
};

export type SweepVerdict = { remove: boolean; reason: string };

function isInsideReviewWorktree(cwd: string | null, worktreeRoot: string): boolean {
  const rootWithSeparator = worktreeRoot.endsWith('/') ? worktreeRoot : `${worktreeRoot}/`;
  return cwd !== null && cwd.startsWith(rootWithSeparator);
}

/** A role session carries a role name and works in a review worktree, or a job file records it. */
export function isRoleSession(
  session: BackgroundSession,
  recognition: RoleSessionRecognition,
): boolean {
  if (recognition.recordedIds.has(session.sessionId)) return true;
  return (
    isRoleSessionName(session.name) && isInsideReviewWorktree(session.cwd, recognition.worktreeRoot)
  );
}

export function sweepVerdictOf(facts: {
  activeJobId: string | null;
  startedAt: Date | null;
  now: Date;
}): SweepVerdict {
  if (facts.activeJobId === null) return { remove: true, reason: 'job no longer active' };
  const age = facts.startedAt === null ? 0 : facts.now.getTime() - facts.startedAt.getTime();
  if (age > MAX_ROLE_SESSION_AGE_MS) {
    return { remove: true, reason: 'started more than 2 hours ago' };
  }
  return { remove: false, reason: `job ${facts.activeJobId} active` };
}
