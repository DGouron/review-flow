/**
 * SPEC-170 — Pre-built Worktree Lifecycle Managed by ReviewFlow
 *
 * Spec: docs/specs/170-prebuilt-worktree-lifecycle.md
 * Plan: docs/plans/170-prebuilt-worktree-lifecycle.plan.md
 *
 * Outer-loop acceptance test (SDD): mirrors the 11 scenarios defined in
 * the spec's `## Scenarios` block. All scenarios assert at the use-case
 * boundary (ensureWorktree / removeWorktree / sweepStaleWorktrees) using
 * `StubGitCommandExecutor`, matching the shape of scenario 9 already
 * shipped in PR #175.
 */

import { vi } from 'vitest';

vi.mock('@/frameworks/config/configLoader.js', () => ({
  loadConfig: vi.fn(() => ({
    queue: { maxConcurrent: 4, deduplicationWindowMs: 60000 },
  })),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildMcpSystemPrompt } from '@/frameworks/claude/claudeInvoker.js';
import { enqueueReview, initQueue, type ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import { startWorktreeSweepScheduler } from '@/frameworks/scheduler/worktreeSweepScheduler.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ensureWorktree } from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';
import { removeWorktree } from '@/modules/worktree-management/usecases/removeWorktree.usecase.js';
import { StubGitCommandExecutor } from '@/tests/stubs/gitCommandExecutor.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

const baseIdentity: WorktreeIdentity = {
  platform: 'gitlab',
  projectPath: 'test-org/test-project',
  mrNumber: 42,
};
const sourceCheckoutPath = '/home/user/projects/test-project';

describe('Acceptance — SPEC-170: Pre-built Worktree Lifecycle', () => {
  describe('Feature: Worktree ensure-or-reuse on review dispatch', () => {
    it('Scenario 1 — first review on new MR: ensureWorktree prunes + fetches branch + worktree-add + writes settings; returns created', async () => {
      const executor = new StubGitCommandExecutor();
      const writeSettingsCalls: WorktreePath[] = [];

      const result = await ensureWorktree(
        {
          identity: baseIdentity,
          sourceBranch: 'feat/x',
          source: { kind: 'origin' },
          sourceCheckoutPath,
        },
        {
          executor,
          worktreeExists: async () => false,
          writeWorktreeSettings: async (path) => {
            writeSettingsCalls.push(path);
            return { status: 'ok' };
          },
        },
      );

      const expectedPath = deriveWorktreePath(baseIdentity);

      expect(result).toEqual({
        status: 'created',
        path: expectedPath,
        settingsWarning: null,
      });

      const pruneCalls = executor.callsOfKind('worktree-prune');
      expect(pruneCalls).toHaveLength(1);
      expect(pruneCalls[0]?.cwd).toBe(sourceCheckoutPath);

      const fetchCalls = executor.callsOfKind('fetch');
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]?.args).toEqual(['fetch', 'origin', 'feat/x']);
      expect(fetchCalls[0]?.cwd).toBe(sourceCheckoutPath);

      const addCalls = executor.callsOfKind('worktree-add');
      expect(addCalls).toHaveLength(1);
      expect(addCalls[0]?.args).toEqual(['worktree', 'add', expectedPath, 'origin/feat/x']);
      expect(addCalls[0]?.cwd).toBe(sourceCheckoutPath);

      expect(executor.callsOfKind('reset-hard')).toHaveLength(0);
      expect(writeSettingsCalls).toEqual([expectedPath]);
    });

    it('Scenario 2 — followup on existing MR: ensureWorktree prunes + fetches inside worktree + reset --hard (no worktree-add, no settings rewrite); returns reused', async () => {
      const executor = new StubGitCommandExecutor();
      const writeSettingsCalls: WorktreePath[] = [];

      const result = await ensureWorktree(
        {
          identity: baseIdentity,
          sourceBranch: 'feat/x',
          source: { kind: 'origin' },
          sourceCheckoutPath,
        },
        {
          executor,
          worktreeExists: async () => true,
          writeWorktreeSettings: async (path) => {
            writeSettingsCalls.push(path);
            return { status: 'ok' };
          },
        },
      );

      const expectedPath = deriveWorktreePath(baseIdentity);

      expect(result).toEqual({ status: 'reused', path: expectedPath });

      const pruneCalls = executor.callsOfKind('worktree-prune');
      expect(pruneCalls).toHaveLength(1);
      expect(pruneCalls[0]?.cwd).toBe(sourceCheckoutPath);

      const fetchCalls = executor.callsOfKind('fetch');
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]?.args).toEqual(['fetch', 'origin', 'feat/x']);
      expect(fetchCalls[0]?.cwd).toBe(expectedPath);

      const resetCalls = executor.callsOfKind('reset-hard');
      expect(resetCalls).toHaveLength(1);
      expect(resetCalls[0]?.args).toEqual(['reset', '--hard', 'origin/feat/x']);
      expect(resetCalls[0]?.cwd).toBe(expectedPath);

      expect(executor.callsOfKind('worktree-add')).toHaveLength(0);
      expect(writeSettingsCalls).toEqual([]);
    });
  });

  describe('Feature: Worktree cleanup on MR close', () => {
    it('Scenario 3 — merge cleanup: removeWorktree on merged identity returns removed', async () => {
      const executor = new StubGitCommandExecutor();
      const worktreeExistsByPath = new Map<WorktreePath, boolean>();
      const result = await removeWorktree(
        { identity: { ...baseIdentity }, sourceCheckoutPath },
        {
          executor,
          worktreeExists: async (path) => {
            if (!worktreeExistsByPath.has(path)) {
              worktreeExistsByPath.set(path, true);
            }
            return worktreeExistsByPath.get(path) ?? false;
          },
        },
      );

      expect(result.status).toBe('removed');
      expect(executor.callsOfKind('worktree-prune').length).toBeGreaterThan(0);
      expect(executor.callsOfKind('worktree-remove').length).toBe(1);
    });

    it('Scenario 4 — close cleanup: removeWorktree on closed identity returns removed', async () => {
      const executor = new StubGitCommandExecutor();
      const result = await removeWorktree(
        {
          identity: { platform: 'github', projectPath: 'owner/repo', mrNumber: 7 },
          sourceCheckoutPath,
        },
        {
          executor,
          worktreeExists: async () => true,
        },
      );

      expect(result.status).toBe('removed');
    });

    it('Scenario 5 — merge with worktree already gone: returns absent, no remove call, no throw', async () => {
      const executor = new StubGitCommandExecutor();
      const result = await removeWorktree(
        { identity: { ...baseIdentity }, sourceCheckoutPath },
        {
          executor,
          worktreeExists: async () => false,
        },
      );

      expect(result.status).toBe('absent');
      expect(executor.callsOfKind('worktree-remove').length).toBe(0);
    });
  });

  describe('Feature: Daily safety-net sweep', () => {
    const sweepRepository = { localPath: '/repos/test-project', enabled: true };
    const sweepNow = new Date('2026-05-23T12:00:00Z');

    function buildTrackedMrFixture(overrides: Partial<TrackedMr>): TrackedMr {
      return {
        id: overrides.id ?? 'gitlab-test-org/test-project-1',
        mrNumber: overrides.mrNumber ?? 1,
        title: 'title',
        url: 'http://example.com',
        project: overrides.project ?? 'test-org/test-project',
        platform: overrides.platform ?? 'gitlab',
        sourceBranch: 'feat/x',
        targetBranch: 'master',
        assignment: { username: 'user', assignedAt: '2026-05-01T00:00:00Z' },
        state: overrides.state ?? 'pending-review',
        openThreads: 0,
        totalThreads: 0,
        createdAt: '2026-05-01T00:00:00Z',
        lastReviewAt: null,
        lastPushAt: null,
        approvedAt: null,
        mergedAt: overrides.mergedAt ?? null,
        reviews: [],
        totalReviews: 0,
        totalFollowups: 0,
        totalBlocking: 0,
        totalWarnings: 0,
        totalSuggestions: 0,
        totalDurationMs: 0,
        latestScore: null,
        autoFollowup: true,
        bypass: null,
      };
    }

    function buildSweepStubGateway(entries: WorktreeEntry[]): {
      gateway: WorktreeGateway;
      readonly removed: WorktreeIdentity[];
    } {
      let liveEntries = [...entries];
      const removed: WorktreeIdentity[] = [];
      const gateway: WorktreeGateway = {
        list: async () => liveEntries,
        remove: async (request) => {
          removed.push(request.identity);
          liveEntries = liveEntries.filter(
            (entry) => deriveWorktreePath(entry.identity) !== deriveWorktreePath(request.identity),
          );
          return { status: 'removed' } satisfies RemoveResult;
        },
        ensure: async () => ({ status: 'failed', reason: 'not-used-in-sweep' }),
        exists: async () => false,
      };
      return {
        gateway,
        get removed() {
          return removed;
        },
      };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(sweepNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Scenario 6 — closed MR over 24h: worktree present + tracker merged 48h ago → remove worktree', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'test-org/test-project',
        mrNumber: 1,
      };
      const entry: WorktreeEntry = {
        identity,
        path: deriveWorktreePath(identity),
        mtime: new Date('2026-05-21T00:00:00Z'),
      };
      const stub = buildSweepStubGateway([entry]);
      const mrId = `${identity.platform}-${identity.projectPath}-${identity.mrNumber}`;
      const tracked = buildTrackedMrFixture({
        id: mrId,
        state: 'merged',
        mergedAt: '2026-05-21T00:00:00Z',
      });

      const handle = startWorktreeSweepScheduler({
        worktreeGateway: stub.gateway,
        trackingGateway: {
          getById: (projectPath, requestedId) =>
            projectPath === sweepRepository.localPath && requestedId === mrId ? tracked : null,
        },
        getRepositories: () => [sweepRepository],
        logger: createStubLogger(),
        now: () => sweepNow,
      });

      await vi.advanceTimersByTimeAsync(10);
      handle.stop();

      expect(stub.removed).toEqual([identity]);
    });

    it('Scenario 7 — orphan: worktree present + no tracked MR → remove worktree', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'test-org/test-project',
        mrNumber: 2,
      };
      const entry: WorktreeEntry = {
        identity,
        path: deriveWorktreePath(identity),
        mtime: new Date('2026-05-23T11:00:00Z'),
      };
      const stub = buildSweepStubGateway([entry]);

      const handle = startWorktreeSweepScheduler({
        worktreeGateway: stub.gateway,
        trackingGateway: { getById: () => null },
        getRepositories: () => [sweepRepository],
        logger: createStubLogger(),
        now: () => sweepNow,
      });

      await vi.advanceTimersByTimeAsync(10);
      handle.stop();

      expect(stub.removed).toEqual([identity]);
    });

    it('Scenario 8 — stale active MR: worktree mtime 8 days old + tracker pending-review → remove worktree', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'test-org/test-project',
        mrNumber: 3,
      };
      const eightDaysAgo = new Date(sweepNow.getTime() - 8 * 24 * 60 * 60 * 1000);
      const entry: WorktreeEntry = {
        identity,
        path: deriveWorktreePath(identity),
        mtime: eightDaysAgo,
      };
      const stub = buildSweepStubGateway([entry]);
      const mrId = `${identity.platform}-${identity.projectPath}-${identity.mrNumber}`;
      const tracked = buildTrackedMrFixture({
        id: mrId,
        mrNumber: identity.mrNumber,
        state: 'pending-review',
      });

      const handle = startWorktreeSweepScheduler({
        worktreeGateway: stub.gateway,
        trackingGateway: {
          getById: (projectPath, requestedId) =>
            projectPath === sweepRepository.localPath && requestedId === mrId ? tracked : null,
        },
        getRepositories: () => [sweepRepository],
        logger: createStubLogger(),
        now: () => sweepNow,
      });

      await vi.advanceTimersByTimeAsync(10);
      handle.stop();

      expect(stub.removed).toEqual([identity]);
    });
  });

  describe('Feature: GitHub cross-fork PR handling', () => {
    it('Scenario 9 — cross-fork PR: ensureWorktree fetches from fork URL with refspec patch-1:refs/remotes/pr-N/head and worktree-add from refs/remotes/pr-N/head', async () => {
      const forkCloneUrl = 'https://github.com/contributor/test-repo.git';
      const identity: WorktreeIdentity = {
        platform: 'github',
        projectPath: 'test-owner/test-repo',
        mrNumber: 77,
      };
      const sourceBranch = 'patch-1';
      const executor = new StubGitCommandExecutor();

      const result = await ensureWorktree(
        {
          identity,
          sourceBranch,
          source: { kind: 'fork', cloneUrl: forkCloneUrl },
          sourceCheckoutPath: '/home/user/projects/test-repo',
        },
        {
          executor,
          worktreeExists: async () => false,
          writeWorktreeSettings: async () => ({ status: 'ok' }),
        },
      );

      expect(result.status).toBe('created');

      const fetchCalls = executor.callsOfKind('fetch');
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]?.args).toEqual([
        'fetch',
        forkCloneUrl,
        `${sourceBranch}:refs/remotes/pr-${identity.mrNumber}/head`,
      ]);

      const addCalls = executor.callsOfKind('worktree-add');
      expect(addCalls).toHaveLength(1);
      expect(addCalls[0]?.args).toEqual([
        'worktree',
        'add',
        deriveWorktreePath(identity),
        `refs/remotes/pr-${identity.mrNumber}/head`,
      ]);
    });
  });

  describe('Feature: Per-MR serialization of concurrent operations', () => {
    it('Scenario 10 — concurrent followups on same MR: second waits for first; both complete in order', async () => {
      initQueue(createStubLogger());

      const events: string[] = [];
      let releaseFirst: () => void = () => {};

      const baseJob: ReviewJob = {
        id: 'gitlab:test-org/test-project:99',
        platform: 'gitlab',
        projectPath: 'test-org/test-project',
        localPath: '/home/user/projects/test-project',
        mrNumber: 99,
        skill: 'review-front',
        mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/99',
        sourceBranch: 'feature/test',
        targetBranch: 'main',
        jobType: 'review',
      };

      const freshEnqueued = await enqueueReview(baseJob, async () => {
        events.push('fresh:start');
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        events.push('fresh:end');
      });
      expect(freshEnqueued).toBe(true);

      const followupJob: ReviewJob = {
        ...baseJob,
        id: 'gitlab-followup:test-org/test-project:99',
        jobType: 'followup',
      };

      const followupEnqueued = await enqueueReview(followupJob, async () => {
        events.push('followup:start');
        events.push('followup:end');
      });
      expect(followupEnqueued).toBe(true);

      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(events).toEqual(['fresh:start']);

      releaseFirst();
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(events).toEqual(['fresh:start', 'fresh:end', 'followup:start', 'followup:end']);
    });
  });

  describe('Feature: System prompt no longer disclaims local state', () => {
    it('Scenario 11 — system prompt contains no UNRELIABLE / FORBIDDEN / glab mr diff / gh pr diff substrings', () => {
      const job: ReviewJob = {
        id: 'gitlab:test-org/test-project:42',
        platform: 'gitlab',
        projectPath: 'test-org/test-project',
        localPath: '/home/user/projects/test-project',
        mrNumber: 42,
        skill: 'review-front',
        mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
        sourceBranch: 'feat/x',
        targetBranch: 'main',
        jobType: 'review',
      };

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).not.toContain('UNRELIABLE');
      expect(prompt).not.toContain('FORBIDDEN');
      expect(prompt).not.toContain('glab mr diff');
      expect(prompt).not.toContain('gh pr diff');
    });
  });
});
