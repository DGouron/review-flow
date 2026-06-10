import { describe, it, expect, vi } from 'vitest';

import {
  renderWorktreeSection,
  renderWorktreeEmptyState,
  renderWorktreeStatusBadge,
  fetchWorktreeOverview,
  triggerManualSweep,
  renderDegradedAlerts,
  triggerForceCleanup,
  formatBytes,
  formatRelativeAge,
  snapshotTotals,
  computeChangedMetricKeys,
} from '@/dashboard/modules/worktreePanel.js';

const NOW_ISO = '2026-05-23T12:00:00.000Z';

function buildViewModel(overrides = {}) {
  return {
    totalCount: 0,
    totalSizeBytes: 0,
    activeCount: 0,
    idleCount: 0,
    staleCount: 0,
    nextSweepAt: '2026-05-24T03:00:00.000Z',
    lastSweep: null,
    groups: [],
    degradedCount: 0,
    degraded: [],
    ...overrides,
  };
}

interface DegradedRowFactoryOverrides {
  mrNumber?: number;
  platform?: 'gitlab' | 'github';
  projectPath?: string;
  path?: string;
  reasonCode?: 'stale' | 'orphan-git-lock' | 'unresolved-conflict';
  reasonLabel?: string;
  detectedAtIso?: string;
  recommendedAction?: string;
  cleanupEndpointPayload?: { platform: 'gitlab' | 'github'; projectPath: string; mrNumber: number };
}

function buildDegradedRow(overrides: DegradedRowFactoryOverrides = {}) {
  const platform = overrides.platform ?? 'gitlab';
  const projectPath = overrides.projectPath ?? 'group/project';
  const mrNumber = overrides.mrNumber ?? 42;
  return {
    mrNumber,
    platform,
    projectPath,
    path: overrides.path ?? '/tmp/worktrees/gitlab-group-project-42',
    reasonCode: overrides.reasonCode ?? 'stale',
    reasonLabel: overrides.reasonLabel ?? 'Worktree inactif depuis 26h',
    detectedAtIso: overrides.detectedAtIso ?? NOW_ISO,
    recommendedAction: overrides.recommendedAction ?? 'Cleanup forcé recommandé',
    cleanupEndpointPayload: overrides.cleanupEndpointPayload ?? { platform, projectPath, mrNumber },
  };
}

describe('renderWorktreeSection', () => {
  it('includes the // WORKTREE POOL header prefix with the total count', () => {
    const html = renderWorktreeSection(buildViewModel({ totalCount: 7 }));

    expect(html).toContain('// WORKTREE POOL');
    expect(html).toContain('7');
  });

  it('renders the empty state when totalCount is zero', () => {
    const html = renderWorktreeSection(buildViewModel({ totalCount: 0 }));

    expect(html).toContain('worktree-empty');
  });

  it('renders a row per worktree when groups are populated', () => {
    const viewModel = buildViewModel({
      totalCount: 2,
      totalSizeBytes: 1024,
      groups: [
        {
          platform: 'gitlab',
          projectPath: 'group/project',
          worktrees: [
            {
              mrNumber: 11,
              path: '/tmp/worktrees/gitlab-group-project-11',
              mtime: NOW_ISO,
              ageSeconds: 60,
              sizeBytes: 512,
              status: 'active',
            },
            {
              mrNumber: 12,
              path: '/tmp/worktrees/gitlab-group-project-12',
              mtime: '2026-05-22T12:00:00.000Z',
              ageSeconds: 86_400,
              sizeBytes: 512,
              status: 'idle',
            },
          ],
        },
      ],
    });

    const html = renderWorktreeSection(viewModel);

    expect(html).toContain('group/project');
    expect(html).toContain('11');
    expect(html).toContain('12');
    expect(html).toContain('ACTIVE');
    expect(html).toContain('IDLE');
  });

  it('renders the sweep button labelled SWEEP NOW', () => {
    const html = renderWorktreeSection(buildViewModel());

    expect(html).toContain('SWEEP NOW');
    expect(html).toMatch(/data-action="sweep"/);
  });

  it('renders lastSweep summary when provided', () => {
    const html = renderWorktreeSection(
      buildViewModel({
        lastSweep: {
          ranAt: '2026-05-23T03:00:00.000Z',
          removed: 2,
          failures: 0,
          scanned: 9,
        },
      }),
    );

    expect(html).toContain('removed 2');
    expect(html).toContain('failures 0');
    expect(html).toContain('scanned 9');
  });

  it('renders "never" when lastSweep is null', () => {
    const html = renderWorktreeSection(buildViewModel({ lastSweep: null }));

    expect(html.toLowerCase()).toContain('never');
  });

  it('escapes HTML special characters in project path', () => {
    const html = renderWorktreeSection(
      buildViewModel({
        totalCount: 1,
        groups: [
          {
            platform: 'gitlab',
            projectPath: '<script>alert(1)</script>',
            worktrees: [
              {
                mrNumber: 1,
                path: '/tmp/x',
                mtime: NOW_ISO,
                ageSeconds: 0,
                sizeBytes: null,
                status: 'active',
              },
            ],
          },
        ],
      }),
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders sizeBytes as "—" when null', () => {
    const html = renderWorktreeSection(
      buildViewModel({
        totalCount: 1,
        groups: [
          {
            platform: 'gitlab',
            projectPath: 'group/project',
            worktrees: [
              {
                mrNumber: 1,
                path: '/tmp/x',
                mtime: NOW_ISO,
                ageSeconds: 0,
                sizeBytes: null,
                status: 'active',
              },
            ],
          },
        ],
      }),
    );

    expect(html).toContain('—');
  });
});

describe('renderWorktreeEmptyState', () => {
  it('returns HTML containing an inline SVG illustration', () => {
    const html = renderWorktreeEmptyState();

    expect(html).toContain('<svg');
    expect(html).toContain('worktree-empty');
  });
});

describe('renderWorktreeStatusBadge', () => {
  it('renders an ACTIVE filled dot glyph', () => {
    const html = renderWorktreeStatusBadge('active');

    expect(html).toContain('ACTIVE');
    expect(html).toContain('worktree-status-active');
  });

  it('renders an IDLE outline dot glyph', () => {
    const html = renderWorktreeStatusBadge('idle');

    expect(html).toContain('IDLE');
    expect(html).toContain('worktree-status-idle');
  });

  it('renders a STALE diamond glyph', () => {
    const html = renderWorktreeStatusBadge('stale');

    expect(html).toContain('STALE');
    expect(html).toContain('worktree-status-stale');
  });
});

describe('formatBytes', () => {
  it('formats null as a placeholder dash', () => {
    expect(formatBytes(null)).toBe('—');
  });

  it('formats bytes under 1024 as B', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes with two decimals', () => {
    expect(formatBytes(1.34 * 1024 * 1024 * 1024)).toBe('1.34 GB');
  });
});

describe('formatRelativeAge', () => {
  it('formats seconds when under a minute', () => {
    expect(formatRelativeAge(45)).toBe('45s');
  });

  it('formats minutes when under an hour', () => {
    expect(formatRelativeAge(8 * 60)).toBe('8m');
  });

  it('formats hours when under a day', () => {
    expect(formatRelativeAge(2 * 60 * 60)).toBe('2h');
  });

  it('formats days when over 24h', () => {
    expect(formatRelativeAge(8 * 24 * 60 * 60)).toBe('8d');
  });
});

describe('fetchWorktreeOverview', () => {
  it('GETs /api/worktrees and returns the parsed JSON body', async () => {
    const fakeBody = buildViewModel({ totalCount: 1 });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeBody,
    });

    const result = await fetchWorktreeOverview(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/api/worktrees');
    expect(result).toEqual(fakeBody);
  });

  it('throws when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(fetchWorktreeOverview(fetchImpl)).rejects.toThrow(/503/);
  });
});

describe('triggerManualSweep', () => {
  it('POSTs /api/worktrees/sweep and returns ok with payload on 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ranAt: NOW_ISO, removed: 2, failures: 0, scanned: 4 }),
    });

    const result = await triggerManualSweep(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/api/worktrees/sweep', { method: 'POST' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.payload.removed).toBe(2);
    }
  });

  it('returns conflict with startedAt on 409', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'sweep-in-progress', startedAt: NOW_ISO }),
    });

    const result = await triggerManualSweep(fetchImpl);

    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.startedAt).toBe(NOW_ISO);
    }
  });

  it('returns error on 500', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'sweep-failed' }),
    });

    const result = await triggerManualSweep(fetchImpl);

    expect(result.status).toBe('error');
  });
});

describe('snapshotTotals', () => {
  it('flattens the view model status counts into a single record', () => {
    const totals = snapshotTotals(
      buildViewModel({
        totalCount: 4,
        activeCount: 2,
        idleCount: 1,
        staleCount: 1,
      }),
    );

    expect(totals).toEqual({ total: 4, active: 2, idle: 1, stale: 1 });
  });

  it('returns zeros for an empty pool view model', () => {
    const totals = snapshotTotals(buildViewModel());

    expect(totals).toEqual({ total: 0, active: 0, idle: 0, stale: 0 });
  });
});

describe('computeChangedMetricKeys', () => {
  it('returns the keys whose values differ between previous and next', () => {
    const previous = { total: 3, active: 2, idle: 1, stale: 0 };
    const next = { total: 4, active: 3, idle: 1, stale: 0 };

    expect(computeChangedMetricKeys(previous, next)).toEqual(['total', 'active']);
  });

  it('returns an empty array when nothing changed', () => {
    const totals = { total: 1, active: 1, idle: 0, stale: 0 };

    expect(computeChangedMetricKeys(totals, totals)).toEqual([]);
  });

  it('treats null previous values as no change (cold start)', () => {
    const previous = { total: null, active: null, idle: null, stale: null };
    const next = { total: 5, active: 5, idle: 0, stale: 0 };

    expect(computeChangedMetricKeys(previous, next)).toEqual([]);
  });
});

describe('renderDegradedAlerts', () => {
  it('returns empty string when no degraded rows are provided', () => {
    const html = renderDegradedAlerts([]);

    expect(html).toBe('');
  });

  it('renders one alert block per degraded row with the French reason label', () => {
    const html = renderDegradedAlerts([
      buildDegradedRow({ mrNumber: 1, reasonLabel: 'Worktree inactif depuis 26h' }),
      buildDegradedRow({
        mrNumber: 2,
        reasonLabel: 'Lock git orphelin depuis 2h',
        reasonCode: 'orphan-git-lock',
      }),
    ]);

    expect(html).toContain('Worktree inactif depuis 26h');
    expect(html).toContain('Lock git orphelin depuis 2h');
  });

  it('emits a FORCE CLEANUP button with platform / projectPath / mrNumber data attributes', () => {
    const html = renderDegradedAlerts([
      buildDegradedRow({ platform: 'github', projectPath: 'org/repo', mrNumber: 99 }),
    ]);

    expect(html).toContain('FORCE CLEANUP');
    expect(html).toMatch(/data-action="force-cleanup"/);
    expect(html).toContain('data-platform="github"');
    expect(html).toContain('data-project-path="org/repo"');
    expect(html).toContain('data-mr-number="99"');
  });

  it('escapes the project path so HTML injection in URLs is neutralised', () => {
    const html = renderDegradedAlerts([
      buildDegradedRow({ projectPath: '<script>alert(1)</script>' }),
    ]);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows the recommended action text', () => {
    const html = renderDegradedAlerts([
      buildDegradedRow({ recommendedAction: 'Cleanup forcé recommandé' }),
    ]);

    expect(html).toContain('Cleanup forcé recommandé');
  });
});

describe('renderWorktreeSection with degraded alerts', () => {
  it('injects the degraded alerts block above the table when degradedCount > 0', () => {
    const viewModel = buildViewModel({
      totalCount: 1,
      degradedCount: 1,
      degraded: [buildDegradedRow()],
      groups: [
        {
          platform: 'gitlab',
          projectPath: 'group/project',
          worktrees: [
            {
              mrNumber: 42,
              path: '/tmp/x',
              mtime: NOW_ISO,
              ageSeconds: 60,
              sizeBytes: 512,
              status: 'stale',
            },
          ],
        },
      ],
    });

    const html = renderWorktreeSection(viewModel);

    expect(html).toContain('FORCE CLEANUP');
    expect(html).toContain('Worktree inactif depuis 26h');
  });

  it('does not render the degraded block when degradedCount is zero', () => {
    const html = renderWorktreeSection(buildViewModel({ totalCount: 1 }));

    expect(html).not.toContain('FORCE CLEANUP');
  });
});

describe('triggerForceCleanup', () => {
  it('POSTs /api/worktrees/cleanup with the JSON payload and returns ok on 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'removed' }),
    });

    const result = await triggerForceCleanup(
      { platform: 'gitlab', projectPath: 'group/project', mrNumber: 42 },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/worktrees/cleanup',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result.status).toBe('ok');
  });

  it('returns conflict on 409', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'cleanup-in-progress' }),
    });

    const result = await triggerForceCleanup(
      { platform: 'gitlab', projectPath: 'group/project', mrNumber: 42 },
      fetchImpl,
    );

    expect(result.status).toBe('conflict');
  });

  it('returns error with reason on 500', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'cleanup-failed', warning: 'EACCES' }),
    });

    const result = await triggerForceCleanup(
      { platform: 'gitlab', projectPath: 'group/project', mrNumber: 42 },
      fetchImpl,
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.reason).toContain('EACCES');
    }
  });
});
