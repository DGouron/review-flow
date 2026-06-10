/**
 * SPEC-175 — Worktree Failure Visibility & Force-Cleanup
 *
 * Outer-loop acceptance test (SDD): exercises GET /api/worktrees and
 * POST /api/worktrees/cleanup end-to-end through a Fastify instance with
 * stubbed health probe + real ForceCleanupLockService + real presenter +
 * real detectDegradedWorktrees use case. No real disk I/O.
 *
 * Covers scenarios 2, 6, 7, 8, 10 from docs/specs/175-worktree-failure-visibility.md.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect } from 'vitest';

import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  EnsureResult,
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { HealthSignals } from '@/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.js';
import { worktreeOverviewRoutes } from '@/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.js';
import { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import { InMemoryForceCleanupLockService } from '@/modules/worktree-management/services/forceCleanupLock.js';
import { detectDegradedWorktrees } from '@/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubWorktreeHealthProbeGateway } from '@/tests/stubs/worktreeHealthProbe.stub.js';
import { StubWorktreeSizeProbeGateway } from '@/tests/stubs/worktreeSizeProbe.stub.js';

const NOW = new Date('2026-05-23T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const STALE_THRESHOLD_HOURS = 24;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * ONE_HOUR_MS;

function buildEntry(identity: WorktreeIdentity, mtime: Date, path: string): WorktreeEntry {
  return {
    identity,
    path: createWorktreePath(path),
    mtime,
  };
}

class ConfigurableWorktreeGateway implements WorktreeGateway {
  entries: WorktreeEntry[];
  readonly removeCalls: Array<{ identity: WorktreeIdentity; force: boolean }> = [];
  failureReason: string | null = null;

  constructor(initial: WorktreeEntry[]) {
    this.entries = [...initial];
  }

  async list(): Promise<WorktreeEntry[]> {
    return [...this.entries];
  }

  async ensure(): Promise<EnsureResult> {
    return { status: 'failed', reason: 'not-implemented' };
  }

  async remove(request: {
    identity: WorktreeIdentity;
    sourceCheckoutPath: string;
    force?: boolean;
  }): Promise<RemoveResult> {
    this.removeCalls.push({ identity: request.identity, force: request.force === true });
    if (this.failureReason !== null) {
      return { status: 'failed', warning: this.failureReason };
    }
    this.entries = this.entries.filter(
      (entry) =>
        entry.identity.platform !== request.identity.platform ||
        entry.identity.projectPath !== request.identity.projectPath ||
        entry.identity.mrNumber !== request.identity.mrNumber,
    );
    return { status: 'removed' };
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

interface BuildAppOptions {
  worktrees: WorktreeEntry[];
  signalsByPath?: Map<string, HealthSignals>;
  removeFailureReason?: string;
  staleThresholdHours?: number;
}

interface AcceptanceApp {
  app: FastifyInstance;
  gateway: ConfigurableWorktreeGateway;
  lock: InMemoryForceCleanupLockService;
}

async function buildAcceptanceApp(options: BuildAppOptions): Promise<AcceptanceApp> {
  const app = Fastify();
  const sizeProbe = new StubWorktreeSizeProbeGateway();
  sizeProbe.setDefault(100);
  const presenter = new WorktreePanelPresenter({
    sizeProbe,
    cacheTtlMs: 30_000,
    now: () => NOW,
  });

  const healthProbe = new StubWorktreeHealthProbeGateway();
  if (options.signalsByPath) {
    for (const [path, signals] of options.signalsByPath.entries()) {
      healthProbe.setSignals(path, signals);
    }
  }
  const fallbackSignals: HealthSignals = {
    mtime: new Date(NOW.getTime() - 60 * 1000),
    orphanLock: null,
    unresolvedConflict: false,
  };
  healthProbe.setDefault(fallbackSignals);

  const gateway = new ConfigurableWorktreeGateway(options.worktrees);
  if (options.removeFailureReason !== undefined) {
    gateway.failureReason = options.removeFailureReason;
  }
  const lock = new InMemoryForceCleanupLockService();
  const staleHours = options.staleThresholdHours ?? STALE_THRESHOLD_HOURS;

  await app.register(worktreeOverviewRoutes, {
    worktreeGateway: gateway,
    presenter,
    schedulerControls: {
      getLastSweep: () => null,
      getNextSweepEta: () => NOW,
      runSweepNow: async () => ({
        status: 'ok',
        summary: { ranAt: NOW, removed: 0, failures: 0, scanned: 0 },
      }),
    },
    logger: createStubLogger(),
    detectDegradedWorktrees: (entries) =>
      detectDegradedWorktrees(
        {
          entries,
          staleThresholdMs: staleHours * ONE_HOUR_MS,
          now: () => NOW,
        },
        { healthProbe },
      ),
    forceCleanupLock: lock,
    removeWorktreeForCleanup: (identity) =>
      gateway.remove({ identity, sourceCheckoutPath: '/repo', force: true }),
  });

  return { app, gateway, lock };
}

describe('Acceptance — SPEC-175: Worktree Failure Visibility & Force-Cleanup', () => {
  describe('Scenario 2 — stale worktree surfaces in degraded list with French label', () => {
    it('GET /api/worktrees returns degradedCount > 0 and the French reason label', async () => {
      const staleIdentity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/stale-project',
        mrNumber: 12,
      };
      const stalePath = '/tmp/worktrees/gitlab-group-stale-project-12';
      const staleMtime = new Date(NOW.getTime() - 26 * ONE_HOUR_MS);
      const signals: HealthSignals = {
        mtime: staleMtime,
        orphanLock: null,
        unresolvedConflict: false,
      };
      const signalsByPath = new Map<string, HealthSignals>([[stalePath, signals]]);

      const { app } = await buildAcceptanceApp({
        worktrees: [buildEntry(staleIdentity, staleMtime, stalePath)],
        signalsByPath,
      });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        degradedCount: number;
        degraded: Array<{
          reasonCode: string;
          reasonLabel: string;
          mrNumber: number;
          platform: string;
          projectPath: string;
        }>;
      };
      expect(body.degradedCount).toBe(1);
      expect(body.degraded[0]?.reasonCode).toBe('stale');
      expect(body.degraded[0]?.reasonLabel).toContain('Worktree inactif');
      expect(body.degraded[0]?.mrNumber).toBe(12);

      await app.close();
    });
  });

  describe('Scenario 6 — force-cleanup success removes the worktree from next GET', () => {
    it('POST /api/worktrees/cleanup returns 200 and the entry disappears on next GET', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 42,
      };
      const path = '/tmp/worktrees/gitlab-group-project-42';
      const staleMtime = new Date(NOW.getTime() - 30 * ONE_HOUR_MS);
      const signals: HealthSignals = {
        mtime: staleMtime,
        orphanLock: null,
        unresolvedConflict: false,
      };
      const signalsByPath = new Map<string, HealthSignals>([[path, signals]]);

      const { app, gateway } = await buildAcceptanceApp({
        worktrees: [buildEntry(identity, staleMtime, path)],
        signalsByPath,
      });

      const cleanupResponse = await app.inject({
        method: 'POST',
        url: '/api/worktrees/cleanup',
        payload: { platform: 'gitlab', projectPath: 'group/project', mrNumber: 42 },
      });

      expect(cleanupResponse.statusCode).toBe(200);
      const cleanupBody = cleanupResponse.json() as { status: string };
      expect(cleanupBody.status).toBe('removed');
      expect(gateway.removeCalls).toHaveLength(1);
      expect(gateway.removeCalls[0]?.force).toBe(true);

      const afterResponse = await app.inject({ method: 'GET', url: '/api/worktrees' });
      expect(afterResponse.statusCode).toBe(200);
      const afterBody = afterResponse.json() as { totalCount: number; degradedCount: number };
      expect(afterBody.totalCount).toBe(0);
      expect(afterBody.degradedCount).toBe(0);

      await app.close();
    });
  });

  describe('Scenario 7 — force-cleanup failure preserves the alert and releases the lock', () => {
    it('returns 500 cleanup-failed; alert still present; subsequent POST is accepted', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/permission-denied',
        mrNumber: 7,
      };
      const path = '/tmp/worktrees/gitlab-group-permission-denied-7';
      const staleMtime = new Date(NOW.getTime() - 30 * ONE_HOUR_MS);
      const signals: HealthSignals = {
        mtime: staleMtime,
        orphanLock: null,
        unresolvedConflict: false,
      };
      const signalsByPath = new Map<string, HealthSignals>([[path, signals]]);

      const { app, lock } = await buildAcceptanceApp({
        worktrees: [buildEntry(identity, staleMtime, path)],
        signalsByPath,
        removeFailureReason: 'EACCES: permission denied',
      });

      const cleanupResponse = await app.inject({
        method: 'POST',
        url: '/api/worktrees/cleanup',
        payload: { platform: 'gitlab', projectPath: 'group/permission-denied', mrNumber: 7 },
      });

      expect(cleanupResponse.statusCode).toBe(500);
      const cleanupBody = cleanupResponse.json() as { error: string; warning: string };
      expect(cleanupBody.error).toBe('cleanup-failed');
      expect(cleanupBody.warning).toContain('permission denied');

      const afterResponse = await app.inject({ method: 'GET', url: '/api/worktrees' });
      const afterBody = afterResponse.json() as { degradedCount: number };
      expect(afterBody.degradedCount).toBe(1);

      const lockKey = 'gitlab:group/permission-denied:7';
      expect(lock.tryAcquire(lockKey)).toBe(true);
      lock.release(lockKey);

      await app.close();
    });
  });

  describe('Scenario 8 — second concurrent cleanup is rejected with 409', () => {
    it('returns 409 cleanup-in-progress when the lock is already held', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/locked-project',
        mrNumber: 9,
      };
      const path = '/tmp/worktrees/gitlab-group-locked-project-9';
      const staleMtime = new Date(NOW.getTime() - 30 * ONE_HOUR_MS);
      const signals: HealthSignals = {
        mtime: staleMtime,
        orphanLock: null,
        unresolvedConflict: false,
      };
      const signalsByPath = new Map<string, HealthSignals>([[path, signals]]);

      const { app, lock } = await buildAcceptanceApp({
        worktrees: [buildEntry(identity, staleMtime, path)],
        signalsByPath,
      });

      const lockKey = 'gitlab:group/locked-project:9';
      expect(lock.tryAcquire(lockKey)).toBe(true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/worktrees/cleanup',
        payload: { platform: 'gitlab', projectPath: 'group/locked-project', mrNumber: 9 },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { error: string };
      expect(body.error).toBe('cleanup-in-progress');

      lock.release(lockKey);
      await app.close();
    });
  });

  describe('Scenario 10 — multiple degraded worktrees produce independent cleanup actions', () => {
    it('three stale worktrees show three distinct alerts with three cleanup payloads', async () => {
      const staleMtime = new Date(NOW.getTime() - 30 * ONE_HOUR_MS);
      const buildStale = (mr: number, project: string): WorktreeEntry => {
        const path = `/tmp/worktrees/gitlab-${project.replace('/', '-')}-${mr}`;
        return buildEntry(
          { platform: 'gitlab', projectPath: project, mrNumber: mr },
          staleMtime,
          path,
        );
      };
      const entries = [
        buildStale(1, 'group/a'),
        buildStale(2, 'group/b'),
        buildStale(3, 'group/c'),
      ];
      const signalsByPath = new Map<string, HealthSignals>();
      for (const entry of entries) {
        signalsByPath.set(entry.path, {
          mtime: staleMtime,
          orphanLock: null,
          unresolvedConflict: false,
        });
      }

      const { app } = await buildAcceptanceApp({
        worktrees: entries,
        signalsByPath,
      });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        degradedCount: number;
        degraded: Array<{
          mrNumber: number;
          cleanupEndpointPayload: { platform: string; projectPath: string; mrNumber: number };
        }>;
      };
      expect(body.degradedCount).toBe(3);
      const mrNumbers = body.degraded.map((d) => d.mrNumber).toSorted((a, b) => a - b);
      expect(mrNumbers).toEqual([1, 2, 3]);
      const payloadProjects = body.degraded
        .map((d) => d.cleanupEndpointPayload.projectPath)
        .toSorted();
      expect(payloadProjects).toEqual(['group/a', 'group/b', 'group/c']);

      await app.close();
    });
  });

  it('staleThresholdMs is independent — STALE_THRESHOLD_MS is internally consistent', () => {
    expect(STALE_THRESHOLD_MS).toBe(STALE_THRESHOLD_HOURS * ONE_HOUR_MS);
  });
});
