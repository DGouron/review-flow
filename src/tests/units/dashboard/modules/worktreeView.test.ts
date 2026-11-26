import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  formatNextSweep,
  formatWriteAge,
  renderWorktreeViewHtml,
} from '@/dashboard/modules/worktreeView.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');

function pool(overrides: Record<string, unknown> = {}) {
  return {
    totalCount: 2,
    totalSizeBytes: 781_000_000,
    activeCount: 2,
    idleCount: 0,
    staleCount: 0,
    nextSweepAt: new Date(NOW + 2 * 3_600_000 + 5 * 60_000).toISOString(),
    lastSweep: { ranAt: '2026-11-26T11:18:00Z', removed: 0, failures: 0, scanned: 2 },
    groups: [
      {
        platform: 'github',
        projectPath: 'acme/app',
        worktrees: [
          {
            mrNumber: 1526,
            path: '/home/ai/.reviewflow/worktrees/github-acme-app-1526-with-a-very-long-directory-name',
            mtime: new Date(NOW - 30 * 60_000).toISOString(),
            ageSeconds: 1800,
            sizeBytes: 625_000_000,
            status: 'active',
          },
        ],
      },
    ],
    degradedCount: 0,
    degraded: [],
    ...overrides,
  };
}

const options = {
  nowMs: NOW,
  retentionDays: 14,
  titleOf: (projectPath: string, mrNumber: number) =>
    projectPath === 'acme/app' && mrNumber === 1526 ? 'Record the <session>' : null,
  purgeArmed: false,
};

describe('formatWriteAge', () => {
  afterEach(() => setLanguage('en'));

  it('reads minutes, hours then days', () => {
    setLanguage('fr');

    expect(formatWriteAge(1800, t)).toBe('il y a 30 min');
    expect(formatWriteAge(7200, t)).toBe('il y a 2 h');
    expect(formatWriteAge(3 * 86_400, t)).toBe('il y a 3 j');
  });
});

describe('formatNextSweep', () => {
  it('counts down to the next sweep', () => {
    expect(formatNextSweep(new Date(NOW + 2 * 3_600_000 + 5 * 60_000).toISOString(), NOW, t)).toBe(
      'in 2 h 05 min',
    );
    expect(formatNextSweep(new Date(NOW - 1000).toISOString(), NOW, t)).toBe('imminent');
  });
});

describe('renderWorktreeViewHtml', () => {
  afterEach(() => setLanguage('en'));

  it('shows the five counters, then one row per worktree with its pull request title', () => {
    setLanguage('fr');
    const html = renderWorktreeViewHtml(pool(), t, options);

    expect(html.match(/class="metric-cell"/g)).toHaveLength(5);
    expect(html).toContain('744.8 MB');
    expect(html).toContain('#1526');
    expect(html).toContain('Record the &lt;session&gt;');
    expect(html).toContain('il y a 30 min');
  });

  it('keeps long paths in a scrollable, truncating table with the full path on hover', () => {
    const html = renderWorktreeViewHtml(pool(), t, options);

    expect(html).toContain('class="table-scroll"');
    expect(html).toContain(
      'title="/home/ai/.reviewflow/worktrees/github-acme-app-1526-with-a-very-long-directory-name"',
    );
    expect(html).toContain('…/github-acme-app-1526-with-a-very-long-directory-name');
  });

  it('gathers the sweep, the report retention and the purge in one card', () => {
    const html = renderWorktreeViewHtml(pool(), t, options);

    expect(html).toContain('data-action="sweep"');
    expect(html).toContain('worktree-sweep-label');
    expect(html).toContain('data-action="purge-reports"');
    expect(html).toContain('14 days');
    expect(html).toContain('in 2 h 05 min');
  });

  it('asks for a confirmation before purging', () => {
    expect(renderWorktreeViewHtml(pool(), t, { ...options, purgeArmed: true })).toContain(
      'Confirm the purge',
    );
    setLanguage('fr');
    expect(renderWorktreeViewHtml(pool(), t, { ...options, purgeArmed: true })).toContain(
      'Confirmer la purge',
    );
  });

  it('lists worktrees in error with a force cleanup, and says so when none is', () => {
    const degraded = pool({
      degradedCount: 1,
      degraded: [
        {
          mrNumber: 12,
          platform: 'github',
          projectPath: 'acme/app',
          path: '/tmp/x',
          reasonCode: 'missing',
          reasonLabel: 'Directory missing',
          detectedAtIso: '',
          recommendedAction: 'Remove it',
          cleanupEndpointPayload: {},
        },
      ],
    });

    expect(renderWorktreeViewHtml(degraded, t, options)).toContain('data-action="force-cleanup"');
    expect(renderWorktreeViewHtml(degraded, t, options)).toContain('1 worktree(s) in error');
    expect(renderWorktreeViewHtml(pool(), t, options)).toContain('No worktree in error');
  });

  it('says the pool is empty', () => {
    expect(renderWorktreeViewHtml(pool({ totalCount: 0, groups: [] }), t, options)).toContain(
      'No worktree on disk',
    );
  });
});
