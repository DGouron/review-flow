import { describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import {
  isRoleSession,
  sweepVerdictOf,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionSweep.js';

const now = new Date('2026-11-27T12:00:00.000Z');
const worktreeRoot = '/home/ai/.reviewflow/worktrees';

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function session(overrides: Partial<BackgroundSession>): BackgroundSession {
  return {
    sessionId: parseSessionId('a1b2c3d4'),
    name: 'Revue #2111 · lot bugs',
    cwd: `${worktreeRoot}/github-acme-app-2111`,
    startedAt: minutesAgo(5),
    ...overrides,
  };
}

describe('isRoleSession', () => {
  const noRecordedIds = new Set<string>();

  it('recognizes a session named like a role session working in a review worktree', () => {
    expect(isRoleSession(session({}), { worktreeRoot, recordedIds: noRecordedIds })).toBe(true);
  });

  it('recognizes a role session in a sub-folder of a review worktree', () => {
    const inPackage = session({ cwd: `${worktreeRoot}/gitlab-acme-api-7/packages/core` });

    expect(isRoleSession(inPackage, { worktreeRoot, recordedIds: noRecordedIds })).toBe(true);
  });

  it('ignores a role-like name outside the review worktrees', () => {
    const outside = session({ cwd: '/home/ai/projects/app' });
    const sibling = session({ cwd: `${worktreeRoot}-backup/github-acme-app-1` });

    expect(isRoleSession(outside, { worktreeRoot, recordedIds: noRecordedIds })).toBe(false);
    expect(isRoleSession(sibling, { worktreeRoot, recordedIds: noRecordedIds })).toBe(false);
  });

  it('ignores the single review session of a worktree, which has no role name', () => {
    const reviewSession = session({ name: null });

    expect(isRoleSession(reviewSession, { worktreeRoot, recordedIds: noRecordedIds })).toBe(false);
  });

  it('recognizes any session whose id a job file records', () => {
    const renamed = session({ name: 'renamed by hand', cwd: null });

    expect(isRoleSession(renamed, { worktreeRoot, recordedIds: new Set(['a1b2c3d4']) })).toBe(true);
  });
});

describe('sweepVerdictOf', () => {
  it('removes a role session whose job is no longer active', () => {
    expect(sweepVerdictOf({ activeJobId: null, startedAt: minutesAgo(5), now })).toEqual({
      remove: true,
      reason: 'job no longer active',
    });
  });

  it('removes a role session of an active job started more than 2 hours ago', () => {
    expect(
      sweepVerdictOf({ activeJobId: 'github:acme/app:2111', startedAt: minutesAgo(121), now }),
    ).toEqual({ remove: true, reason: 'started more than 2 hours ago' });
  });

  it('keeps a recent role session of an active job', () => {
    expect(
      sweepVerdictOf({ activeJobId: 'github:acme/app:2111', startedAt: minutesAgo(119), now }),
    ).toEqual({ remove: false, reason: 'job github:acme/app:2111 active' });
  });

  it('keeps a role session of an active job whose start is unknown', () => {
    expect(sweepVerdictOf({ activeJobId: 'job-1', startedAt: null, now }).remove).toBe(false);
  });
});
