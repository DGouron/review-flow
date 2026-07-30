import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { countSucceeded } from '@/shared/foundation/executionGateway.base.js';

// AC6/AC7: the context auto-path executor is bounded to read + postComment.
// THREAD_RESOLVE / ADD_LABEL are dropped (no-op, logged), POST_COMMENT executes.
describe('executeActionsFromContext (auto path, capability-bounded)', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const mockExecutor = vi.fn();

  const baseContext: ReviewContext = {
    version: '1.0',
    mergeRequestId: 'github-owner/repo-42',
    platform: 'github',
    projectPath: 'owner/repo',
    mergeRequestNumber: 42,
    createdAt: '2026-02-02T10:00:00Z',
    threads: [],
    actions: [],
    progress: { phase: 'completed', currentStep: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty result when no actions are present', async () => {
    const context = { ...baseContext, actions: [] };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  it('drops THREAD_RESOLVE without invoking the executor', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'THREAD_RESOLVE', threadId: 'PRRT_kwDONxxx' }],
    };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    expect(result.total).toBe(0);
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  it('executes POST_COMMENT action', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'POST_COMMENT', body: '## Follow-up Review\n\nAll fixed.' }],
    };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(mockExecutor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repos/owner/repo/issues/42/comments']),
      '/tmp/repo',
    );
  });

  it('drops ADD_LABEL without invoking the executor', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'ADD_LABEL', label: 'needs_approve' }],
    };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    expect(result.total).toBe(0);
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  it('keeps only allowed verbs in a mixed stream', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'thread-1' },
        { type: 'THREAD_RESOLVE', threadId: 'thread-2' },
        { type: 'POST_COMMENT', body: 'Done' },
        { type: 'ADD_LABEL', label: 'approved' },
      ],
    };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    // Only the single POST_COMMENT survives the capability filter.
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(mockExecutor).toHaveBeenCalledTimes(1);
  });

  it('handles GitLab platform postComment', async () => {
    const context: ReviewContext = {
      ...baseContext,
      platform: 'gitlab',
      actions: [{ type: 'POST_COMMENT', body: 'note' }],
    };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    expect(result.succeeded).toBe(1);
    expect(mockExecutor).toHaveBeenCalledWith('glab', expect.arrayContaining(['api']), '/tmp/repo');
  });

  describe('inventory-gated THREAD_RESOLVE re-admission', () => {
    const thread = (id: string) => ({
      id,
      file: null,
      line: null,
      status: 'open' as const,
      body: 'previous review note',
    });

    it('executes THREAD_RESOLVE when the threadId is in the authenticated thread inventory', async () => {
      const context: ReviewContext = {
        ...baseContext,
        platform: 'gitlab',
        projectPath: 'group/proj',
        mergeRequestNumber: 5,
        threads: [thread('disc-1')],
        actions: [{ type: 'THREAD_RESOLVE', threadId: 'disc-1' }],
      };

      const result = await executeActionsFromContext(
        context,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(mockExecutor).toHaveBeenCalledWith(
        'glab',
        expect.arrayContaining(['resolved=true']),
        '/tmp/repo',
      );
    });

    it('drops THREAD_RESOLVE whose threadId is not in the authenticated inventory (forged id)', async () => {
      const context: ReviewContext = {
        ...baseContext,
        platform: 'gitlab',
        threads: [thread('disc-1')],
        actions: [{ type: 'THREAD_RESOLVE', threadId: 'forged-999' }],
      };

      const result = await executeActionsFromContext(
        context,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(result.total).toBe(0);
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('trims the threadId before checking inventory membership', async () => {
      const context: ReviewContext = {
        ...baseContext,
        platform: 'gitlab',
        threads: [thread('disc-1')],
        actions: [{ type: 'THREAD_RESOLVE', threadId: 'disc-1 ' }],
      };

      const result = await executeActionsFromContext(
        context,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(result.succeeded).toBe(1);
      const resolveArgs = mockExecutor.mock.calls[0][1] as string[];
      const discussionArg = resolveArgs.find((arg) => arg.includes('/discussions/'));
      expect(discussionArg?.endsWith('discussions/disc-1')).toBe(true);
      expect(resolveArgs).toContain('resolved=true');
    });

    it('posts the reply before resolving, then resolves the in-inventory thread', async () => {
      const context: ReviewContext = {
        ...baseContext,
        platform: 'gitlab',
        threads: [thread('disc-1')],
        actions: [
          { type: 'THREAD_RESOLVE', threadId: 'disc-1' },
          { type: 'THREAD_REPLY', threadId: 'disc-1', message: 'Fixed' },
        ],
      };

      const result = await executeActionsFromContext(
        context,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      const commands = mockExecutor.mock.calls.map((call) => (call[1] as string[]).join(' '));
      const replyIndex = commands.findIndex((command) =>
        command.includes('discussions/disc-1/notes'),
      );
      const resolveIndex = commands.findIndex((command) => command.includes('resolved=true'));
      expect(replyIndex).toBeGreaterThanOrEqual(0);
      expect(resolveIndex).toBeGreaterThan(replyIndex);
    });
  });

  it('continues executing when one allowed action fails', async () => {
    mockExecutor.mockImplementationOnce(() => {
      throw new Error('API error');
    });

    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'POST_COMMENT', body: 'first' },
        { type: 'POST_COMMENT', body: 'second' },
      ],
    };

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor);

    expect(result.total).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  describe('a failed command is reported, never counted as done', () => {
    const contextWithAuthenticatedResolve: ReviewContext = {
      ...baseContext,
      threads: [
        {
          id: 'PRRT_kwDONxxx',
          file: 'src/app.ts',
          line: 3,
          status: 'open',
          body: 'blocking finding',
        },
      ],
      actions: [{ type: 'THREAD_RESOLVE', threadId: 'PRRT_kwDONxxx' }],
    };

    it('logs the command error with the action type', async () => {
      mockExecutor.mockImplementationOnce(() => {
        throw new Error('gh: Could not resolve to a node with the global id');
      });

      await executeActionsFromContext(
        contextWithAuthenticatedResolve,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          actionType: 'THREAD_RESOLVE',
          error: 'gh: Could not resolve to a node with the global id',
        },
        'Review action command failed',
      );
    });

    it('leaves the failed resolve out of the succeeded count', async () => {
      mockExecutor.mockImplementationOnce(() => {
        throw new Error('gh: Could not resolve to a node with the global id');
      });

      const result = await executeActionsFromContext(
        contextWithAuthenticatedResolve,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(countSucceeded(result, 'THREAD_RESOLVE')).toBe(0);
    });

    it('counts a resolve that the platform accepted', async () => {
      const result = await executeActionsFromContext(
        contextWithAuthenticatedResolve,
        '/tmp/repo',
        mockLogger,
        mockExecutor,
      );

      expect(countSucceeded(result, 'THREAD_RESOLVE')).toBe(1);
    });
  });
});
