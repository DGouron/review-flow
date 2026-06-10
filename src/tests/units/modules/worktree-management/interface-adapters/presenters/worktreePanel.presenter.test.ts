import { describe, it, expect, beforeEach } from 'vitest';

import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { WorktreeHealthReport } from '@/modules/worktree-management/entities/worktree/worktreeHealth.schema.js';
import { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import { LastSweepSummaryFactory } from '@/tests/factories/lastSweepSummary.factory.js';
import { WorktreeHealthFactory } from '@/tests/factories/worktreeHealth.factory.js';
import { StubWorktreeSizeProbeGateway } from '@/tests/stubs/worktreeSizeProbe.stub.js';

const NOW = new Date('2026-05-23T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function buildEntry(identity: WorktreeIdentity, mtime: Date, absolutePath: string): WorktreeEntry {
  return {
    identity,
    path: createWorktreePath(absolutePath),
    mtime,
  };
}

describe('WorktreePanelPresenter', () => {
  let presenter: WorktreePanelPresenter;
  let sizeProbe: StubWorktreeSizeProbeGateway;

  beforeEach(() => {
    sizeProbe = new StubWorktreeSizeProbeGateway();
    presenter = new WorktreePanelPresenter({
      sizeProbe,
      cacheTtlMs: 30_000,
      now: () => NOW,
    });
  });

  describe('status thresholds', () => {
    it('labels a worktree younger than 24h as active', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 1,
      };
      const path = '/tmp/worktrees/gitlab-group-project-1';
      sizeProbe.setSize(path, 100);
      const mtime = new Date(NOW.getTime() - ONE_HOUR_MS);

      const viewModel = await presenter.present({
        worktrees: [buildEntry(identity, mtime, path)],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups[0]?.worktrees[0]?.status).toBe('active');
    });

    it('labels a worktree between 24h and 7d as idle', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 2,
      };
      const path = '/tmp/worktrees/gitlab-group-project-2';
      sizeProbe.setSize(path, 100);
      const mtime = new Date(NOW.getTime() - 36 * ONE_HOUR_MS);

      const viewModel = await presenter.present({
        worktrees: [buildEntry(identity, mtime, path)],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups[0]?.worktrees[0]?.status).toBe('idle');
    });

    it('labels a worktree older than 7d as stale', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 3,
      };
      const path = '/tmp/worktrees/gitlab-group-project-3';
      sizeProbe.setSize(path, 100);
      const mtime = new Date(NOW.getTime() - 8 * ONE_DAY_MS);

      const viewModel = await presenter.present({
        worktrees: [buildEntry(identity, mtime, path)],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups[0]?.worktrees[0]?.status).toBe('stale');
    });

    it('labels a worktree at exactly 24h as idle (boundary is inclusive on idle)', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 4,
      };
      const path = '/tmp/worktrees/gitlab-group-project-4';
      sizeProbe.setSize(path, 100);
      const mtime = new Date(NOW.getTime() - ONE_DAY_MS);

      const viewModel = await presenter.present({
        worktrees: [buildEntry(identity, mtime, path)],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups[0]?.worktrees[0]?.status).toBe('idle');
    });
  });

  describe('grouping and sorting', () => {
    it('groups by (platform, projectPath) and sorts groups alphabetically', async () => {
      sizeProbe.setDefault(100);
      const worktrees: WorktreeEntry[] = [
        buildEntry(
          { platform: 'gitlab', projectPath: 'zzz/project', mrNumber: 10 },
          new Date(NOW.getTime() - ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-zzz-project-10',
        ),
        buildEntry(
          { platform: 'gitlab', projectPath: 'aaa/project', mrNumber: 20 },
          new Date(NOW.getTime() - ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-aaa-project-20',
        ),
        buildEntry(
          { platform: 'github', projectPath: 'aaa/project', mrNumber: 30 },
          new Date(NOW.getTime() - ONE_HOUR_MS),
          '/tmp/worktrees/github-aaa-project-30',
        ),
      ];

      const viewModel = await presenter.present({
        worktrees,
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups).toHaveLength(3);
      const ordered = viewModel.groups.map((group) => `${group.platform}:${group.projectPath}`);
      expect(ordered).toEqual(['github:aaa/project', 'gitlab:aaa/project', 'gitlab:zzz/project']);
    });

    it('sorts worktrees within a group by mtime descending', async () => {
      sizeProbe.setDefault(100);
      const identityOld: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 1,
      };
      const identityNew: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 2,
      };
      const worktrees: WorktreeEntry[] = [
        buildEntry(
          identityOld,
          new Date(NOW.getTime() - 5 * ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-group-project-1',
        ),
        buildEntry(
          identityNew,
          new Date(NOW.getTime() - ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-group-project-2',
        ),
      ];

      const viewModel = await presenter.present({
        worktrees,
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups[0]?.worktrees.map((row) => row.mrNumber)).toEqual([2, 1]);
    });
  });

  describe('size cache (30s TTL)', () => {
    it('does not re-probe the same path within the TTL window', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 1,
      };
      const path = '/tmp/worktrees/gitlab-group-project-1';
      sizeProbe.setSize(path, 200);
      const entry = buildEntry(identity, new Date(NOW.getTime() - ONE_HOUR_MS), path);

      await presenter.present({ worktrees: [entry], lastSweep: null, nextSweepAt: NOW });
      await presenter.present({ worktrees: [entry], lastSweep: null, nextSweepAt: NOW });

      expect(sizeProbe.calls).toHaveLength(1);
    });

    it('re-probes after the TTL window expires', async () => {
      let currentTime = NOW.getTime();
      const presenterWithClock = new WorktreePanelPresenter({
        sizeProbe,
        cacheTtlMs: 30_000,
        now: () => new Date(currentTime),
      });
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 1,
      };
      const path = '/tmp/worktrees/gitlab-group-project-1';
      sizeProbe.setSize(path, 200);
      const entry = buildEntry(identity, new Date(currentTime - ONE_HOUR_MS), path);

      await presenterWithClock.present({
        worktrees: [entry],
        lastSweep: null,
        nextSweepAt: new Date(currentTime),
      });
      currentTime += 35_000;
      await presenterWithClock.present({
        worktrees: [entry],
        lastSweep: null,
        nextSweepAt: new Date(currentTime),
      });

      expect(sizeProbe.calls).toHaveLength(2);
    });
  });

  describe('size aggregation', () => {
    it('sums total size skipping null entries', async () => {
      const identityOne: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 1,
      };
      const identityTwo: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 2,
      };
      const pathOne = '/tmp/worktrees/gitlab-group-project-1';
      const pathTwo = '/tmp/worktrees/gitlab-group-project-2';
      sizeProbe.setSize(pathOne, 500);
      sizeProbe.setSize(pathTwo, null);

      const viewModel = await presenter.present({
        worktrees: [
          buildEntry(identityOne, new Date(NOW.getTime() - ONE_HOUR_MS), pathOne),
          buildEntry(identityTwo, new Date(NOW.getTime() - ONE_HOUR_MS), pathTwo),
        ],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.totalSizeBytes).toBe(500);
      expect(viewModel.totalCount).toBe(2);
      const sizes = viewModel.groups[0]?.worktrees.map((row) => row.sizeBytes);
      expect(sizes).toContain(null);
      expect(sizes).toContain(500);
    });
  });

  describe('lastSweep and nextSweep', () => {
    it('returns null lastSweep when none provided', async () => {
      const viewModel = await presenter.present({
        worktrees: [],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.lastSweep).toBeNull();
    });

    it('formats lastSweep ranAt as ISO string', async () => {
      const summary = LastSweepSummaryFactory.create({
        ranAt: new Date('2026-05-23T03:00:00.000Z'),
        removed: 2,
        failures: 0,
        scanned: 9,
      });

      const viewModel = await presenter.present({
        worktrees: [],
        lastSweep: summary,
        nextSweepAt: NOW,
      });

      expect(viewModel.lastSweep).toEqual({
        ranAt: '2026-05-23T03:00:00.000Z',
        removed: 2,
        failures: 0,
        scanned: 9,
      });
    });

    it('formats nextSweepAt as ISO string', async () => {
      const nextSweep = new Date('2026-05-24T03:00:00.000Z');

      const viewModel = await presenter.present({
        worktrees: [],
        lastSweep: null,
        nextSweepAt: nextSweep,
      });

      expect(viewModel.nextSweepAt).toBe('2026-05-24T03:00:00.000Z');
    });
  });

  describe('empty pool', () => {
    it('returns empty groups and zero counters when no worktree exists', async () => {
      const viewModel = await presenter.present({
        worktrees: [],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.groups).toEqual([]);
      expect(viewModel.totalCount).toBe(0);
      expect(viewModel.totalSizeBytes).toBe(0);
      expect(viewModel.activeCount).toBe(0);
      expect(viewModel.idleCount).toBe(0);
      expect(viewModel.staleCount).toBe(0);
    });
  });

  describe('status counts', () => {
    it('exposes activeCount / idleCount / staleCount computed from status thresholds', async () => {
      const entries: WorktreeEntry[] = [
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/active-a', mrNumber: 1 },
          new Date(NOW.getTime() - ONE_HOUR_MS),
          '/tmp/worktrees/active-a',
        ),
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/active-b', mrNumber: 2 },
          new Date(NOW.getTime() - 2 * ONE_HOUR_MS),
          '/tmp/worktrees/active-b',
        ),
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/idle', mrNumber: 3 },
          new Date(NOW.getTime() - 36 * ONE_HOUR_MS),
          '/tmp/worktrees/idle',
        ),
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/stale', mrNumber: 4 },
          new Date(NOW.getTime() - 8 * ONE_DAY_MS),
          '/tmp/worktrees/stale',
        ),
      ];
      for (const entry of entries) sizeProbe.setSize(entry.path, 100);

      const viewModel = await presenter.present({
        worktrees: entries,
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.activeCount).toBe(2);
      expect(viewModel.idleCount).toBe(1);
      expect(viewModel.staleCount).toBe(1);
      expect(viewModel.totalCount).toBe(4);
    });
  });

  describe('degraded health reports', () => {
    it('defaults degradedCount to 0 and degraded to [] when no healthReports are provided', async () => {
      const viewModel = await presenter.present({
        worktrees: [],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      expect(viewModel.degradedCount).toBe(0);
      expect(viewModel.degraded).toEqual([]);
    });

    it('produces one DegradedRowViewModel per degraded report with French stale label', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 12,
      };
      const path = '/tmp/worktrees/gitlab-group-project-12';
      const mtime = new Date(NOW.getTime() - 26 * ONE_HOUR_MS);
      const entry = buildEntry(identity, mtime, path);
      const report: WorktreeHealthReport = {
        entry,
        health: WorktreeHealthFactory.stale({
          ageMs: 26 * ONE_HOUR_MS,
          thresholdMs: 24 * ONE_HOUR_MS,
          detectedAt: NOW,
        }),
      };

      const viewModel = await presenter.present({
        worktrees: [entry],
        lastSweep: null,
        nextSweepAt: NOW,
        healthReports: [report],
      });

      expect(viewModel.degradedCount).toBe(1);
      const row = viewModel.degraded[0];
      expect(row?.mrNumber).toBe(12);
      expect(row?.platform).toBe('gitlab');
      expect(row?.projectPath).toBe('group/project');
      expect(row?.path).toBe(path);
      expect(row?.reasonCode).toBe('stale');
      expect(row?.reasonLabel).toContain('Worktree inactif');
      expect(row?.reasonLabel).toContain('26');
      expect(row?.detectedAtIso).toBe(NOW.toISOString());
      expect(row?.recommendedAction.length).toBeGreaterThan(0);
      expect(row?.cleanupEndpointPayload).toEqual({
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 12,
      });
    });

    it('formats orphan-git-lock with French lock label and lock age in hours', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/lock',
        mrNumber: 5,
      };
      const path = '/tmp/worktrees/gitlab-group-lock-5';
      const entry = buildEntry(identity, new Date(NOW.getTime() - 60_000), path);
      const report: WorktreeHealthReport = {
        entry,
        health: WorktreeHealthFactory.orphanLock({
          lockPath: '/main/.git/worktrees/abc/index.lock',
          lockAgeMs: 2 * ONE_HOUR_MS,
          detectedAt: NOW,
        }),
      };

      const viewModel = await presenter.present({
        worktrees: [entry],
        lastSweep: null,
        nextSweepAt: NOW,
        healthReports: [report],
      });

      const row = viewModel.degraded[0];
      expect(row?.reasonCode).toBe('orphan-git-lock');
      expect(row?.reasonLabel).toContain('Lock git orphelin');
      expect(row?.reasonLabel).toContain('2');
    });

    it('formats unresolved-conflict with a static French label', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/conflict',
        mrNumber: 6,
      };
      const path = '/tmp/worktrees/gitlab-group-conflict-6';
      const entry = buildEntry(identity, new Date(NOW.getTime() - 60_000), path);
      const report: WorktreeHealthReport = {
        entry,
        health: WorktreeHealthFactory.unresolvedConflict({ detectedAt: NOW }),
      };

      const viewModel = await presenter.present({
        worktrees: [entry],
        lastSweep: null,
        nextSweepAt: NOW,
        healthReports: [report],
      });

      const row = viewModel.degraded[0];
      expect(row?.reasonCode).toBe('unresolved-conflict');
      expect(row?.reasonLabel).toBe('Conflit git non résolu');
    });

    it('excludes healthy reports from the degraded list', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/healthy',
        mrNumber: 8,
      };
      const path = '/tmp/worktrees/gitlab-group-healthy-8';
      const entry = buildEntry(identity, new Date(NOW.getTime() - 60_000), path);
      const report: WorktreeHealthReport = {
        entry,
        health: WorktreeHealthFactory.healthy(),
      };

      const viewModel = await presenter.present({
        worktrees: [entry],
        lastSweep: null,
        nextSweepAt: NOW,
        healthReports: [report],
      });

      expect(viewModel.degradedCount).toBe(0);
      expect(viewModel.degraded).toEqual([]);
    });

    it('produces N independent rows for N degraded entries (scenario 10)', async () => {
      const stale = WorktreeHealthFactory.stale({
        ageMs: 30 * ONE_HOUR_MS,
        thresholdMs: 24 * ONE_HOUR_MS,
        detectedAt: NOW,
      });
      const entries: WorktreeEntry[] = [
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/a', mrNumber: 1 },
          new Date(NOW.getTime() - 30 * ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-group-a-1',
        ),
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/b', mrNumber: 2 },
          new Date(NOW.getTime() - 30 * ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-group-b-2',
        ),
        buildEntry(
          { platform: 'gitlab', projectPath: 'group/c', mrNumber: 3 },
          new Date(NOW.getTime() - 30 * ONE_HOUR_MS),
          '/tmp/worktrees/gitlab-group-c-3',
        ),
      ];
      const reports: WorktreeHealthReport[] = entries.map((entry) => ({ entry, health: stale }));

      const viewModel = await presenter.present({
        worktrees: entries,
        lastSweep: null,
        nextSweepAt: NOW,
        healthReports: reports,
      });

      expect(viewModel.degradedCount).toBe(3);
      expect(viewModel.degraded).toHaveLength(3);
    });
  });

  describe('row identity fields', () => {
    it('exposes mrNumber, path, mtime ISO string, ageSeconds, sizeBytes, status', async () => {
      const identity: WorktreeIdentity = {
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 42,
      };
      const path = '/tmp/worktrees/gitlab-group-project-42';
      sizeProbe.setSize(path, 1024);
      const mtime = new Date(NOW.getTime() - 8 * 60 * 1000);

      const viewModel = await presenter.present({
        worktrees: [buildEntry(identity, mtime, path)],
        lastSweep: null,
        nextSweepAt: NOW,
      });

      const row = viewModel.groups[0]?.worktrees[0];
      expect(row?.mrNumber).toBe(42);
      expect(row?.path).toBe(path);
      expect(row?.mtime).toBe(mtime.toISOString());
      expect(row?.ageSeconds).toBe(480);
      expect(row?.sizeBytes).toBe(1024);
      expect(row?.status).toBe('active');
    });
  });
});
