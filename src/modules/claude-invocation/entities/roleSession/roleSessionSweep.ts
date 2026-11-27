import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import { isRoleSessionName } from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';

const MINUTE_MS = 60_000;
const MINIMUM_AGE_LIMIT_MS = 120 * MINUTE_MS;
/** Time a launch may take between `claude --bg` returning and the job file recording the session. */
const RECORDING_GRACE_MS = 5 * MINUTE_MS;

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

/** A role session may live as long as the review it serves, and at least 2 hours. */
export function roleSessionAgeLimitMs(reviewTimeoutMs: number): number {
  return Math.max(MINIMUM_AGE_LIMIT_MS, reviewTimeoutMs);
}

function durationInWords(milliseconds: number): string {
  const minutes = Math.round(milliseconds / MINUTE_MS);
  return minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
}

export function sweepVerdictOf(facts: {
  activeJobId: string | null;
  startedAt: Date | null;
  now: Date;
  maxAgeMs: number;
}): SweepVerdict {
  const age = facts.startedAt === null ? null : facts.now.getTime() - facts.startedAt.getTime();
  if (facts.activeJobId === null) {
    if (age !== null && age < RECORDING_GRACE_MS) {
      return { remove: false, reason: 'launched less than 5 minutes ago, not recorded yet' };
    }
    return { remove: true, reason: 'job no longer active' };
  }
  if (age !== null && age > facts.maxAgeMs) {
    return { remove: true, reason: `started more than ${durationInWords(facts.maxAgeMs)} ago` };
  }
  return { remove: false, reason: `job ${facts.activeJobId} active` };
}
