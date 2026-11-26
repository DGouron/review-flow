/**
 * SPEC-231 — Team and Worktrees views of the redesigned dashboard.
 *
 * Outer-loop acceptance test. Source of truth: docs/specs/231-dashboard-team-and-worktree-views.md.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { buildTeamViewModel, renderTeamViewHtml } from '@/dashboard/modules/teamView.js';
import { renderWorktreeViewHtml } from '@/dashboard/modules/worktreeView.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const DAY = 86_400_000;

function developer(name: string) {
  return {
    developerName: name,
    title: 'architect',
    overallLevel: 7,
    categoryLevels: {
      quality: { level: 8, trend: 'improving' },
      responsiveness: { level: 2, trend: 'stable' },
      codeVolume: { level: 3, trend: 'declining' },
      iteration: { level: 7, trend: 'stable' },
    },
    topPriority: 'responsiveness',
    reviewCount: 40,
    metrics: { averageBlocking: 0.1, averageAdditions: 500, firstReviewQualityRate: 0.5 },
  };
}

const insights = {
  isEmpty: false,
  developers: [developer('carol'), developer('dave')],
  team: {
    developerCount: 2,
    totalReviewCount: 80,
    averageLevels: { quality: 8, responsiveness: 2, codeVolume: 3, iteration: 7 },
    strengths: [],
    weaknesses: [],
    tips: [],
  },
  aiInsights: {
    generatedAt: new Date(NOW - 59 * DAY).toISOString(),
    team: {
      summary: 'Summary',
      strengths: ['S'],
      weaknesses: ['W'],
      recommendations: ['R'],
      dynamics: '',
    },
    developers: [{ developerName: 'carol', title: 'Builder' }],
  },
  hasNewReviewsSinceAiGeneration: false,
};

const pool = {
  totalCount: 1,
  totalSizeBytes: 600_000_000,
  activeCount: 1,
  idleCount: 0,
  staleCount: 0,
  nextSweepAt: new Date(NOW + 3_600_000).toISOString(),
  lastSweep: null,
  groups: [
    {
      platform: 'github',
      projectPath: 'acme/app',
      worktrees: [
        {
          mrNumber: 1526,
          path: '/home/ai/.reviewflow/worktrees/github-acme-app-1526-a-very-long-directory-name-indeed',
          mtime: '',
          ageSeconds: 1800,
          sizeBytes: 600_000_000,
          status: 'active',
        },
      ],
    },
  ],
  degradedCount: 0,
  degraded: [],
};

describe('SPEC-231 — team and worktrees views', () => {
  afterEach(() => setLanguage('en'));

  it('a member card shows what waits for them and opens their queue on the first lane that needs them', () => {
    const html = renderTeamViewHtml(
      buildTeamViewModel(insights, [{ lane: 'approve', author: { username: 'dave' } }], NOW),
      t,
    );

    expect(html).toContain('data-action="filter-member" data-author="dave" data-lane="approve"');
    expect(html).toContain('1 to approve');
  });

  it('the developer sheet stays one click away from each card', () => {
    expect(renderTeamViewHtml(buildTeamViewModel(insights, [], NOW), t)).toContain(
      'data-action="open-developer" data-developer="carol"',
    );
  });

  it('the AI analysis says its age and who it leaves out, with regenerate and export', () => {
    setLanguage('fr');
    const html = renderTeamViewHtml(buildTeamViewModel(insights, [], NOW), t);

    expect(html).toContain('il y a 2 mois');
    expect(html).toContain('dave n&#39;y figure pas');
    expect(html).toContain('data-action="regenerate-analysis"');
    expect(html).toContain('data-action="export-report"');
  });

  it('levels show as meters, never as a score out of ten', () => {
    expect(renderTeamViewHtml(buildTeamViewModel(insights, [], NOW), t)).not.toMatch(/\/\s*10/);
  });

  it('the worktree table scrolls inside its card and truncates long paths', () => {
    const html = renderWorktreeViewHtml(pool, t, {
      nowMs: NOW,
      retentionDays: 14,
      titleOf: () => 'Record the session',
      purgeArmed: false,
    });

    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('…/github-acme-app-1526-a-very-long-directory-name-indeed');
    expect(html).toContain('#1526');
    expect(html).toContain('Record the session');
  });

  it('sweep, retention and purge of old reports sit together', () => {
    const html = renderWorktreeViewHtml(pool, t, {
      nowMs: NOW,
      retentionDays: 14,
      titleOf: () => null,
      purgeArmed: false,
    });

    expect(html).toContain('data-action="sweep"');
    expect(html).toContain('data-action="purge-reports"');
    expect(html).toContain('14 days');
    expect(html).toContain('No worktree in error');
  });
});
