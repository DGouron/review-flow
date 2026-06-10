/**
 * SPEC-173 — Dashboard Worktree Panel
 *
 * Outer-loop acceptance test (SDD): exercises the GET /api/worktrees and
 * POST /api/worktrees/sweep endpoints end-to-end through a Fastify instance.
 * No real scheduler timer, no real disk I/O, no real du — stubs only.
 * Covers Scenarios 1, 2, 5, 6, 7 per docs/specs/173-dashboard-worktree-panel.md.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect } from 'vitest';

import { startWorktreeSweepScheduler } from '@/frameworks/scheduler/worktreeSweepScheduler.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';
import type { RunSweepNowResult } from '@/modules/worktree-management/entities/sweep/runSweepResult.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  EnsureResult,
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { worktreeOverviewRoutes } from '@/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.js';
import { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import { LastSweepSummaryFactory } from '@/tests/factories/lastSweepSummary.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubWorktreeSizeProbeGateway } from '@/tests/stubs/worktreeSizeProbe.stub.js';

const NOW = new Date('2026-05-23T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function buildEntry(identity: WorktreeIdentity, mtime: Date, path: string): WorktreeEntry {
  return {
    identity,
    path: createWorktreePath(path),
    mtime,
  };
}

class ConfigurableWorktreeGateway implements WorktreeGateway {
  entries: WorktreeEntry[];
  readonly removed: WorktreeIdentity[] = [];

  constructor(initial: WorktreeEntry[]) {
    this.entries = [...initial];
  }

  async list(): Promise<WorktreeEntry[]> {
    return [...this.entries];
  }

  async ensure(): Promise<EnsureResult> {
    return { status: 'failed', reason: 'not-implemented' };
  }

  async remove({ identity }: { identity: WorktreeIdentity }): Promise<RemoveResult> {
    this.removed.push(identity);
    this.entries = this.entries.filter(
      (e) =>
        e.identity.platform !== identity.platform ||
        e.identity.projectPath !== identity.projectPath ||
        e.identity.mrNumber !== identity.mrNumber,
    );
    return { status: 'removed' };
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

interface BuildAppOptions {
  worktrees: WorktreeEntry[];
  sizeMap?: Record<string, number | null>;
  lastSweep?: LastSweepSummary | null;
  nextSweepAt?: Date;
  runSweepNow?: () => Promise<RunSweepNowResult>;
}

async function buildAcceptanceApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify();
  const sizeProbe = new StubWorktreeSizeProbeGateway();
  if (options.sizeMap) {
    for (const [path, size] of Object.entries(options.sizeMap)) {
      sizeProbe.setSize(path, size);
    }
  } else {
    sizeProbe.setDefault(100);
  }
  const presenter = new WorktreePanelPresenter({
    sizeProbe,
    cacheTtlMs: 30_000,
    now: () => NOW,
  });

  let lastSweep = options.lastSweep ?? null;
  const nextSweepAt = options.nextSweepAt ?? NOW;
  const defaultRunSweep = async (): Promise<RunSweepNowResult> => {
    const summary = LastSweepSummaryFactory.create({
      ranAt: NOW,
      removed: 4,
      failures: 0,
      scanned: 4,
    });
    lastSweep = summary;
    return { status: 'ok', summary };
  };

  await app.register(worktreeOverviewRoutes, {
    worktreeGateway: new ConfigurableWorktreeGateway(options.worktrees),
    presenter,
    schedulerControls: {
      getLastSweep: () => lastSweep,
      getNextSweepEta: () => nextSweepAt,
      runSweepNow: options.runSweepNow ?? defaultRunSweep,
    },
    logger: createStubLogger(),
  });

  return app;
}

describe('Acceptance — SPEC-173: Dashboard Worktree Panel', () => {
  describe('Scenario 1 — list worktrees with active + idle + stale', () => {
    it('returns 3 rows with statuses [active, idle, stale]', async () => {
      const activeIdentity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/a',
        mrNumber: 1,
      };
      const idleIdentity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/b',
        mrNumber: 2,
      };
      const staleIdentity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/c',
        mrNumber: 3,
      };
      const activePath = '/tmp/worktrees/gitlab-group-a-1';
      const idlePath = '/tmp/worktrees/gitlab-group-b-2';
      const stalePath = '/tmp/worktrees/gitlab-group-c-3';

      const app = await buildAcceptanceApp({
        worktrees: [
          buildEntry(activeIdentity, new Date(NOW.getTime() - ONE_HOUR_MS), activePath),
          buildEntry(idleIdentity, new Date(NOW.getTime() - 36 * ONE_HOUR_MS), idlePath),
          buildEntry(staleIdentity, new Date(NOW.getTime() - 8 * ONE_DAY_MS), stalePath),
        ],
        sizeMap: { [activePath]: 100, [idlePath]: 200, [stalePath]: 300 },
      });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        totalCount: number;
        totalSizeBytes: number;
        groups: Array<{ worktrees: Array<{ status: string }> }>;
      };
      expect(body.totalCount).toBe(3);
      expect(body.totalSizeBytes).toBe(600);
      const statuses = body.groups.flatMap((g) => g.worktrees.map((w) => w.status));
      expect(statuses).toContain('active');
      expect(statuses).toContain('idle');
      expect(statuses).toContain('stale');

      await app.close();
    });
  });

  describe('Scenario 2 — empty worktree pool', () => {
    it('renders empty groups and zero counters', async () => {
      const app = await buildAcceptanceApp({ worktrees: [] });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        totalCount: number;
        totalSizeBytes: number;
        groups: unknown[];
      };
      expect(body.totalCount).toBe(0);
      expect(body.totalSizeBytes).toBe(0);
      expect(body.groups).toEqual([]);

      await app.close();
    });
  });

  describe('Scenario 5 — manual sweep success', () => {
    it('POST /api/worktrees/sweep returns 200 with the new summary', async () => {
      const summary = LastSweepSummaryFactory.create({ removed: 4, failures: 0, scanned: 4 });
      const app = await buildAcceptanceApp({
        worktrees: [],
        runSweepNow: async () => ({ status: 'ok', summary }),
      });

      const response = await app.inject({ method: 'POST', url: '/api/worktrees/sweep' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { removed: number; failures: number; scanned: number };
      expect(body.removed).toBe(4);
      expect(body.failures).toBe(0);
      expect(body.scanned).toBe(4);

      await app.close();
    });
  });

  describe('Scenario 6 — manual sweep conflict', () => {
    it('POST /api/worktrees/sweep returns 409 with startedAt when a sweep is already running', async () => {
      const startedAt = new Date('2026-05-23T11:59:57.000Z');
      const app = await buildAcceptanceApp({
        worktrees: [],
        runSweepNow: async () => ({ status: 'conflict', startedAt }),
      });

      const response = await app.inject({ method: 'POST', url: '/api/worktrees/sweep' });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { error: string; startedAt: string };
      expect(body.error).toBe('sweep-in-progress');
      expect(body.startedAt).toBe(startedAt.toISOString());

      await app.close();
    });
  });

  describe('Scenario 7 — lastSweep null on cold start', () => {
    it('GET /api/worktrees returns lastSweep: null right after server start', async () => {
      const app = await buildAcceptanceApp({ worktrees: [], lastSweep: null });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { lastSweep: LastSweepSummary | null };
      expect(body.lastSweep).toBeNull();

      await app.close();
    });
  });

  describe('Scheduler integration (FR-3) — scheduler exposes controls consumed by the routes', () => {
    it('startWorktreeSweepScheduler exposes getLastSweep, getNextSweepEta, runSweepNow', () => {
      const stubGateway: WorktreeGateway = {
        list: async () => [],
        remove: async () => ({ status: 'removed' }),
        ensure: async () => ({ status: 'failed', reason: 'not-implemented' }),
        exists: async () => false,
      };
      const trackingGateway = { getById: (_p: string, _id: string): TrackedMr | null => null };
      const scheduler = startWorktreeSweepScheduler({
        worktreeGateway: stubGateway,
        trackingGateway,
        getRepositories: () => [],
        logger: createStubLogger(),
        now: () => NOW,
      });

      expect(typeof scheduler.stop).toBe('function');
      expect(typeof scheduler.getLastSweep).toBe('function');
      expect(typeof scheduler.getNextSweepEta).toBe('function');
      expect(typeof scheduler.runSweepNow).toBe('function');

      scheduler.stop();
    });
  });
});
