import { describe, it, expect } from 'vitest';

import {
  AUTO_EXECUTOR_CAPABILITIES,
  EXECUTOR_CAPABILITY_TABLE,
} from '@/modules/platform-integration/entities/executorToken/executorCapability.js';
import {
  resolvePinnedThreadFetchTarget,
  resolvePinnedThreads,
} from '@/modules/platform-integration/services/pinnedThreadFetchTarget.js';
import {
  buildScopedExecutorEnvironment,
  ENV_ALLOWLIST,
  MissingExecutorTokenError,
} from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import type {
  ThreadInventoryGateway,
  ThreadInventoryPage,
} from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { dispatchConstrainedActions } from '@/modules/review-execution/services/dispatchConstrainedActions.js';

const TOKEN = 'glpat-service-token-acceptance';
const TEMP_ROOT = '/tmp/reviewflow-executor-acceptance';

class RecordingFileWriter {
  public readonly writes: Array<{ path: string; contents: string }> = [];
  public readonly ensuredDirs: string[] = [];
  write(path: string, contents: string): void {
    this.writes.push({ path, contents });
  }
  ensureDir(path: string): void {
    this.ensuredDirs.push(path);
  }
}

class RecordingExecutor {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  run = (command: string, args: string[]): void => {
    this.calls.push({ command, args });
  };
}

class RecordingCliExecutor {
  readonly commands: string[] = [];
  run = (command: string): string => {
    this.commands.push(command);
    return '';
  };
}

class RecordingPostGateway {
  readonly posts: Array<{ projectPath: string; mrNumber: number; body: string }> = [];
  postComment = async (input: {
    projectPath: string;
    mrNumber: number;
    body: string;
  }): Promise<void> => {
    this.posts.push(input);
  };
}

class RecordingThreadFetch {
  public readonly calls: Array<{ projectPath: string; mrNumber: number }> = [];
  fetchThreads = (projectPath: string, mrNumber: number) => {
    this.calls.push({ projectPath, mrNumber });
    return [];
  };
}

class StubInventoryGateway implements ThreadInventoryGateway {
  private pages: ThreadInventoryPage[] = [];
  setPages(pages: ThreadInventoryPage[]): void {
    this.pages = pages;
  }
  fetchPage(_projectPath: string, _mergeRequestNumber: number, page: number): ThreadInventoryPage {
    const found = this.pages.find((candidate) => candidate.page === page);
    if (!found) throw new Error(`no page ${page}`);
    return found;
  }
}

class RecordingLogger {
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  info(): void {}
  warn(_obj: object, message: string): void {
    this.warnings.push(message);
  }
  debug(): void {}
  error(_obj: object, message: string): void {
    this.errors.push(message);
  }
}

const dispatchContext = {
  platform: 'gitlab' as const,
  projectPath: 'group/project',
  mrNumber: 42,
  localPath: '/tmp/repo',
};

function resolveDiscussionWrites(
  executor: RecordingExecutor,
): Array<{ command: string; args: string[] }> {
  return executor.calls.filter(
    (call) => call.args.includes('PUT') && call.args.some((arg) => arg.includes('/discussions/')),
  );
}

function buildContextWith(actions: ReviewAction[], threadIds: string[]): ReviewContext {
  return {
    version: '1',
    mergeRequestId: 'gitlab-group/project-42',
    platform: 'gitlab',
    projectPath: 'group/project',
    mergeRequestNumber: 42,
    createdAt: '2026-01-01T00:00:00.000Z',
    threads: threadIds.map((id) => ({
      id,
      file: null,
      line: null,
      status: 'open',
      body: 'thread',
    })),
    actions,
    progress: { phase: 'completed', currentStep: null },
  };
}

describe('SPEC-196 least-privilege platform token (acceptance)', () => {
  describe('AC1 — dedicated service token, fail-closed', () => {
    it('refuses to construct the executor environment when the token is absent (zero file writes)', () => {
      const fileWriter = new RecordingFileWriter();
      expect(() =>
        buildScopedExecutorEnvironment({
          parentEnv: { PATH: '/usr/bin' },
          isolatedDir: TEMP_ROOT,
          fileWriter,
        }),
      ).toThrow(MissingExecutorTokenError);
      expect(fileWriter.writes).toHaveLength(0);
      expect(fileWriter.ensuredDirs).toHaveLength(0);
    });
  });

  describe('AC2/AC3 — env built by allowlist, token never in env', () => {
    it('keeps the child env keyset within the allowlist, drops the canary, and never carries the token', () => {
      const fileWriter = new RecordingFileWriter();
      const { env } = buildScopedExecutorEnvironment({
        parentEnv: {
          REVIEWFLOW_EXECUTOR_TOKEN: TOKEN,
          PATH: '/usr/bin',
          LANG: 'en_US.UTF-8',
          AMBIENT_ADMIN_TOKEN: 'canary',
        },
        isolatedDir: TEMP_ROOT,
        fileWriter,
      });

      for (const key of Object.keys(env)) {
        expect(ENV_ALLOWLIST).toContain(key);
      }
      expect('AMBIENT_ADMIN_TOKEN' in env).toBe(false);
      for (const value of Object.values(env)) {
        expect(value).not.toBe(TOKEN);
      }
      expect(fileWriter.writes[0]?.contents).toContain(TOKEN);
      expect(fileWriter.writes[0]?.path.startsWith(TEMP_ROOT)).toBe(true);
    });
  });

  describe('AC5 — minimal role frozen per action', () => {
    it('locks the auto-executor capability set to exactly {readMr, postComment}', () => {
      expect([...AUTO_EXECUTOR_CAPABILITIES].toSorted()).toEqual(['postComment', 'readMr']);
      expect(EXECUTOR_CAPABILITY_TABLE.threadResolve.autoPath).toBe(false);
      expect(EXECUTOR_CAPABILITY_TABLE.revoke.autoPath).toBe(false);
    });
  });

  describe('AC6/AC7 — removed write verbs are inert, postComment still fires', () => {
    it('through the stdout chokepoint: postComment fires once, THREAD_RESOLVE records zero write calls, no throw', async () => {
      const executor = new RecordingExecutor();
      const postGateway = new RecordingPostGateway();
      const inventory = new StubInventoryGateway();
      inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['10'] }]);

      const actions: ReviewAction[] = [
        { type: 'POST_COMMENT', body: 'review summary' },
        { type: 'THREAD_RESOLVE', threadId: '10' },
        { type: 'FETCH_THREADS' },
      ];

      await dispatchConstrainedActions(actions, {
        context: dispatchContext,
        provenance: 'untrusted',
        inventoryGateway: inventory,
        logger: new RecordingLogger(),
        executor: executor.run,
        postGateway,
      });

      expect(postGateway.posts).toHaveLength(1);
      expect(postGateway.posts[0]?.body).toBe('review summary');
      expect(resolveDiscussionWrites(executor)).toHaveLength(0);
    });

    it('through the context-file path: a THREAD_RESOLVE on an empty authenticated inventory records zero write calls', async () => {
      const executor = new RecordingCliExecutor();
      const context = buildContextWith([{ type: 'THREAD_RESOLVE', threadId: '10' }], []);

      await executeActionsFromContext(context, '/tmp/repo', new RecordingLogger(), executor.run);

      expect(executor.commands).toHaveLength(0);
    });
  });

  describe('AC9 — action-target identity pinned to trusted provenance, fail-closed', () => {
    it('an unrecognized projectPath resolves to no target (fail-closed)', () => {
      const target = resolvePinnedThreadFetchTarget({
        payloadProjectPath: 'attacker/unknown',
        payloadMrNumber: 5,
        findRepository: () => null,
        gatedMrNumber: 5,
      });
      expect(target).toBeNull();
    });

    it('the followup path never calls fetchThreads for an unrecognized project (empty action surface)', () => {
      const fetch = new RecordingThreadFetch();
      const logger = new RecordingLogger();

      const threads = resolvePinnedThreads({
        payloadProjectPath: 'attacker/unknown',
        payloadMrNumber: 5,
        findRepository: () => null,
        gatedMrNumber: 5,
        fetchThreads: fetch.fetchThreads,
        logger,
      });

      expect(threads).toEqual([]);
      expect(fetch.calls).toHaveLength(0);
    });
  });
});
