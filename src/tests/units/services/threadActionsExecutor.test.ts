import {
  executeThreadActions,
  type ExecutionContext,
  type CommandExecutor,
} from '@/modules/review-execution/services/threadActionsExecutor.js';
import type { ThreadAction } from '@/modules/review-execution/services/threadActionsParser.js';

// AC6/AC7: the deprecated auto-path executor is bounded to the read+postComment
// capability set. THREAD_RESOLVE / THREAD_REPLY / ADD_LABEL are dropped as no-ops
// (logged, not executed, no escalation). POST_COMMENT and FETCH_THREADS remain.
describe('executeThreadActions (auto path, capability-bounded)', () => {
  const mockExecutor: CommandExecutor = vi.fn();
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GitLab platform', () => {
    const gitlabContext: ExecutionContext = {
      platform: 'gitlab',
      projectPath: 'mentor-goal/main-app-v3',
      mrNumber: 4658,
      localPath: '/tmp/repo',
    };

    it('executes THREAD_REPLY (note-create, postComment capability)', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_REPLY', threadId: 'abc123', message: 'Fixed!' },
      ];

      await executeThreadActions(actions, gitlabContext, mockLogger, mockExecutor);

      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('drops THREAD_RESOLVE without invoking the executor', async () => {
      const actions: ThreadAction[] = [{ type: 'THREAD_RESOLVE', threadId: 'abc123' }];

      await executeThreadActions(actions, gitlabContext, mockLogger, mockExecutor);

      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('executes POST_COMMENT with correct glab command', async () => {
      const actions: ThreadAction[] = [{ type: 'POST_COMMENT', body: '## Review Complete' }];

      await executeThreadActions(actions, gitlabContext, mockLogger, mockExecutor);

      expect(mockExecutor).toHaveBeenCalledWith(
        'glab',
        [
          'api',
          '--method',
          'POST',
          'projects/mentor-goal%2Fmain-app-v3/merge_requests/4658/notes',
          '--field',
          'body=## Review Complete',
        ],
        '/tmp/repo',
      );
    });
  });

  describe('GitHub platform', () => {
    const githubContext: ExecutionContext = {
      platform: 'github',
      projectPath: 'owner/repo',
      mrNumber: 123,
      localPath: '/tmp/repo',
    };

    it('drops THREAD_RESOLVE without invoking the executor', async () => {
      const actions: ThreadAction[] = [{ type: 'THREAD_RESOLVE', threadId: 'PRRT_abc123' }];

      await executeThreadActions(actions, githubContext, mockLogger, mockExecutor);

      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('executes THREAD_REPLY (note-create, postComment capability)', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_REPLY', threadId: '12345', message: 'Fixed!' },
      ];

      await executeThreadActions(actions, githubContext, mockLogger, mockExecutor);

      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('executes POST_COMMENT with gh api command', async () => {
      const actions: ThreadAction[] = [{ type: 'POST_COMMENT', body: '## Review Complete' }];

      await executeThreadActions(actions, githubContext, mockLogger, mockExecutor);

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          '--method',
          'POST',
          'repos/owner/repo/issues/123/comments',
          '--field',
          'body=## Review Complete',
        ],
        '/tmp/repo',
      );
    });
  });

  describe('FETCH_THREADS action', () => {
    it('is a read-allowed no-op at the gateway (skipped)', async () => {
      const actions: ThreadAction[] = [{ type: 'FETCH_THREADS' }];
      const context: ExecutionContext = {
        platform: 'gitlab',
        projectPath: 'test/project',
        mrNumber: 1,
        localPath: '/tmp/repo',
      };

      const result = await executeThreadActions(actions, context, mockLogger, mockExecutor);

      expect(mockExecutor).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });
  });

  describe('error handling on the allowed (postComment) path', () => {
    const context: ExecutionContext = {
      platform: 'gitlab',
      projectPath: 'test/project',
      mrNumber: 1,
      localPath: '/tmp/repo',
    };

    it('continues execution after an API error on a postComment', async () => {
      const failingExecutor: CommandExecutor = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('API 404');
        })
        .mockImplementationOnce(() => {});

      const actions: ThreadAction[] = [
        { type: 'POST_COMMENT', body: 'first' },
        { type: 'POST_COMMENT', body: 'second' },
      ];

      const result = await executeThreadActions(actions, context, mockLogger, failingExecutor);

      expect(failingExecutor).toHaveBeenCalledTimes(2);
      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(1);
    });

    it('summarises a mixed stream: dropped write verbs never reach the executor', async () => {
      const actions: ThreadAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 'a' },
        { type: 'POST_COMMENT', body: 'note' },
        { type: 'FETCH_THREADS' },
      ];

      const result = await executeThreadActions(actions, context, mockLogger, mockExecutor);

      // THREAD_RESOLVE filtered out entirely; gateway sees POST_COMMENT + FETCH_THREADS.
      expect(mockExecutor).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  describe('empty actions', () => {
    it('returns zero counts for an empty actions array', async () => {
      const context: ExecutionContext = {
        platform: 'gitlab',
        projectPath: 'test/project',
        mrNumber: 1,
        localPath: '/tmp/repo',
      };

      const result = await executeThreadActions([], context, mockLogger, mockExecutor);

      expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, skipped: 0, outcomes: [] });
      expect(mockExecutor).not.toHaveBeenCalled();
    });
  });
});
