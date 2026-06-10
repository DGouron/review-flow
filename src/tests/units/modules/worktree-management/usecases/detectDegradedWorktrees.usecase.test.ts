import { describe, it, expect } from 'vitest';

import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { HealthSignals } from '@/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.js';
import { detectDegradedWorktrees } from '@/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.js';
import { StubWorktreeHealthProbeGateway } from '@/tests/stubs/worktreeHealthProbe.stub.js';

const NOW = new Date('2026-05-23T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 24 * ONE_HOUR_MS;

function buildEntry(mrNumber: number, mtime: Date, path: string): WorktreeEntry {
  const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group/project', mrNumber };
  return { identity, path: createWorktreePath(path), mtime };
}

function freshSignals(): HealthSignals {
  return {
    mtime: new Date(NOW.getTime() - 5 * 60 * 1000),
    orphanLock: null,
    unresolvedConflict: false,
  };
}

describe('detectDegradedWorktrees use case', () => {
  it('returns healthy when no signal trips and the entry is fresh', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const entry = buildEntry(
      1,
      new Date(NOW.getTime() - 5 * 60 * 1000),
      '/tmp/worktrees/gitlab-group-project-1',
    );
    probe.setSignals(entry.path, freshSignals());

    const reports = await detectDegradedWorktrees(
      { entries: [entry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.health.status).toBe('healthy');
  });

  it('flags stale when the entry mtime is older than the threshold', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const staleMtime = new Date(NOW.getTime() - 26 * ONE_HOUR_MS);
    const entry = buildEntry(2, staleMtime, '/tmp/worktrees/gitlab-group-project-2');
    probe.setSignals(entry.path, { ...freshSignals(), mtime: staleMtime });

    const reports = await detectDegradedWorktrees(
      { entries: [entry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    expect(reports[0]?.health.status).toBe('degraded');
    if (reports[0]?.health.status === 'degraded') {
      expect(reports[0].health.reason.kind).toBe('stale');
      if (reports[0].health.reason.kind === 'stale') {
        expect(reports[0].health.reason.ageMs).toBe(26 * ONE_HOUR_MS);
        expect(reports[0].health.reason.thresholdMs).toBe(STALE_THRESHOLD_MS);
      }
    }
  });

  it('flags orphan-git-lock when the probe reports a lock present and the entry is not stale', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const entry = buildEntry(
      3,
      new Date(NOW.getTime() - 5 * 60 * 1000),
      '/tmp/worktrees/gitlab-group-project-3',
    );
    probe.setSignals(entry.path, {
      ...freshSignals(),
      orphanLock: {
        present: true,
        path: '/main/.git/worktrees/abc/index.lock',
        ageMs: 2 * ONE_HOUR_MS,
      },
    });

    const reports = await detectDegradedWorktrees(
      { entries: [entry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    expect(reports[0]?.health.status).toBe('degraded');
    if (
      reports[0]?.health.status === 'degraded' &&
      reports[0].health.reason.kind === 'orphan-git-lock'
    ) {
      expect(reports[0].health.reason.lockAgeMs).toBe(2 * ONE_HOUR_MS);
      expect(reports[0].health.reason.lockPath).toBe('/main/.git/worktrees/abc/index.lock');
    }
  });

  it('flags unresolved-conflict when the probe reports a conflict', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const entry = buildEntry(
      4,
      new Date(NOW.getTime() - 5 * 60 * 1000),
      '/tmp/worktrees/gitlab-group-project-4',
    );
    probe.setSignals(entry.path, { ...freshSignals(), unresolvedConflict: true });

    const reports = await detectDegradedWorktrees(
      { entries: [entry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    expect(reports[0]?.health.status).toBe('degraded');
    if (reports[0]?.health.status === 'degraded') {
      expect(reports[0].health.reason.kind).toBe('unresolved-conflict');
    }
  });

  it('returns stale first when stale and orphan-lock both apply (detection order is stale → orphan-lock → conflict)', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const staleMtime = new Date(NOW.getTime() - 30 * ONE_HOUR_MS);
    const entry = buildEntry(6, staleMtime, '/tmp/worktrees/gitlab-group-project-6');
    probe.setSignals(entry.path, {
      mtime: staleMtime,
      orphanLock: {
        present: true,
        path: '/main/.git/worktrees/x/index.lock',
        ageMs: 1 * ONE_HOUR_MS,
      },
      unresolvedConflict: true,
    });

    const reports = await detectDegradedWorktrees(
      { entries: [entry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    if (reports[0]?.health.status === 'degraded') {
      expect(reports[0].health.reason.kind).toBe('stale');
    } else {
      expect.fail('expected degraded');
    }
  });

  it('processes multiple entries independently', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const freshEntry = buildEntry(
      7,
      new Date(NOW.getTime() - 5 * 60 * 1000),
      '/tmp/worktrees/gitlab-group-project-7',
    );
    const staleEntry = buildEntry(
      8,
      new Date(NOW.getTime() - 30 * ONE_HOUR_MS),
      '/tmp/worktrees/gitlab-group-project-8',
    );
    probe.setSignals(freshEntry.path, freshSignals());
    probe.setSignals(staleEntry.path, { ...freshSignals(), mtime: staleEntry.mtime });

    const reports = await detectDegradedWorktrees(
      { entries: [freshEntry, staleEntry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    expect(reports).toHaveLength(2);
    expect(reports[0]?.health.status).toBe('healthy');
    expect(reports[1]?.health.status).toBe('degraded');
  });

  it('stamps detectedAt with the now() clock for each degraded entry', async () => {
    const probe = new StubWorktreeHealthProbeGateway();
    const staleMtime = new Date(NOW.getTime() - 30 * ONE_HOUR_MS);
    const entry = buildEntry(9, staleMtime, '/tmp/worktrees/gitlab-group-project-9');
    probe.setSignals(entry.path, { ...freshSignals(), mtime: staleMtime });

    const reports = await detectDegradedWorktrees(
      { entries: [entry], staleThresholdMs: STALE_THRESHOLD_MS, now: () => NOW },
      { healthProbe: probe },
    );

    if (reports[0]?.health.status === 'degraded') {
      expect(reports[0].health.detectedAt.toISOString()).toBe(NOW.toISOString());
    } else {
      expect.fail('expected degraded');
    }
  });
});
