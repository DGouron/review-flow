import { describe, it, expect } from 'vitest';

import {
  createClaudeSession,
  markCompleted,
  markFailed,
  markCleaned,
  isExpired,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

describe('ClaudeSession entity', () => {
  const baseInput = {
    sessionId: parseSessionId('7c5dcf5d'),
    jobId: 'gitlab:owner/repo:42',
    jobType: 'review' as const,
    localPath: '/tmp/project',
    mergeRequestId: 'gitlab-owner/repo-42',
    dispatchedAt: new Date('2026-05-22T10:00:00Z'),
  };

  it('creates a session in "dispatched" status', () => {
    const session = createClaudeSession(baseInput);

    expect(session.status).toBe('dispatched');
    expect(session.sessionId).toBe('7c5dcf5d');
    expect(session.jobId).toBe('gitlab:owner/repo:42');
    expect(session.dispatchedAt.toISOString()).toBe('2026-05-22T10:00:00.000Z');
  });

  it('marks the session as completed', () => {
    const session = createClaudeSession(baseInput);

    const updated = markCompleted(session);

    expect(updated.status).toBe('completed');
  });

  it('marks the session as failed with a reason', () => {
    const session = createClaudeSession(baseInput);

    const updated = markFailed(session, 'timeout');

    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('timeout');
  });

  it('marks the session as cleaned', () => {
    const session = createClaudeSession(baseInput);
    const failed = markFailed(session, 'timeout');

    const cleaned = markCleaned(failed);

    expect(cleaned.status).toBe('cleaned');
  });

  it('reports expired when elapsed exceeds the timeout', () => {
    const session = createClaudeSession(baseInput);
    const now = new Date('2026-05-22T10:16:00Z');

    expect(isExpired(session, now, 15 * 60 * 1000)).toBe(true);
  });

  it('reports not expired when elapsed is below the timeout', () => {
    const session = createClaudeSession(baseInput);
    const now = new Date('2026-05-22T10:05:00Z');

    expect(isExpired(session, now, 15 * 60 * 1000)).toBe(false);
  });

  it('rejects a session id that is not a non-empty string', () => {
    expect(() => parseSessionId('')).toThrow();
  });
});
