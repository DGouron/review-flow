import { describe, expect, it } from 'vitest';

import { renderStatsPageHtml } from '@/dashboard/modules/statsPage.js';

function createTranslate() {
  return (key: string, params?: Record<string, string | number>) => {
    let value = key;
    if (params) {
      for (const [param, replacement] of Object.entries(params)) {
        value = value.replaceAll(`{{${param}}}`, String(replacement));
      }
    }
    return value;
  };
}

function createData(overrides = {}) {
  return {
    summary: {
      totalReviews: 100,
      averageScore: '7.5',
      totalTime: '12h 30m',
      averageTime: '7m',
      totalBlocking: 12,
      totalWarnings: 30,
      bugsDetected: 42,
      totalCommits: 312,
      totalAdditions: 8400,
      totalDeletions: 2100,
      averageCommits: '3.1',
      averageAdditions: '84.0',
      averageDeletions: '21.0',
      totalLinesReviewed: 10500,
      trend: { score: 'up', blocking: 'stable' },
    },
    stats: { reviews: [{ assignedBy: 'alice', score: 8 }] },
    analyticsHeader: { isEmpty: false, reviewsPerMonth: [] },
    bugsByCategory: { isEmpty: false },
    keyInsights: null,
    ...overrides,
  };
}

describe('renderStatsPageHtml', () => {
  const t = createTranslate();

  it('renders an empty state when summary is missing', () => {
    const html = renderStatsPageHtml({ summary: null }, t);
    expect(html).toContain('empty.statsNoData');
  });

  it('renders the volume hero with commits and diff totals', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('stats-volume');
    expect(html).toContain('stats.commits');
    expect(html).toContain('stats.linesAdded');
    expect(html).toContain('stats.linesDeleted');
    expect(html).toContain('stats.netLines');
    expect(html).toContain('312');
    expect(html).toContain('8400');
    expect(html).toContain('2100');
  });

  it('computes net lines as additions minus deletions', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('6300');
  });

  it('renders the per-MR averages alongside the totals', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('3.1');
    expect(html).toContain('84.0');
    expect(html).toContain('21.0');
  });

  it('renders the quality KPI cards', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('stats.averageScore');
    expect(html).toContain('stats.blocking');
    expect(html).toContain('stats.warnings');
    expect(html).toContain('7.5');
  });

  it('renders the total bugs-detected KPI from blocking plus warnings', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('stats.kpi.bugsCaught');
    expect(html).toContain('metric-bugs');
    expect(html).toContain('data-target="42"');
  });

  it('wraps charts in a section with a // TRENDS eyebrow', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('stats-trends');
    expect(html).toContain('// TRENDS');
  });

  it('renders every chart canvas the page wires up', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('id="stats-score-trend"');
    expect(html).toContain('id="stats-activity"');
    expect(html).toContain('id="stats-distribution"');
    expect(html).toContain('id="stats-reviews-per-month"');
    expect(html).toContain('id="stats-bugs-category"');
  });

  it('adds role="img" and aria-label to every chart canvas', () => {
    const html = renderStatsPageHtml(createData(), t);
    const canvasCount = (html.match(/role="img"/g) || []).length;
    expect(canvasCount).toBe(5);
    expect(html).toContain('aria-label="stats.scoreTrend chart"');
    expect(html).toContain('aria-label="stats.reviewActivity chart"');
    expect(html).toContain('aria-label="stats.scoreDistribution chart"');
    expect(html).toContain('aria-label="stats.reviewsPerMonth chart"');
    expect(html).toContain('aria-label="stats.bugsByCategory chart"');
  });

  it('builds a dev filter from the reviews', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('stats.allDevs');
    expect(html).toContain('alice');
  });

  it('sets aria-pressed="true" on the active dev-filter button and false on others', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('class="dev-filter-btn active" aria-pressed="true"');
  });

  it('marks trend icon elements aria-hidden with an sr-only direction label', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('>trending up<');
  });

  it('includes an sr-only ratio bar summary with percentages', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toMatch(/class="sr-only">[0-9]+% additions, [0-9]+% deletions<\/span>/);
  });

  it('emits correct ratio percentages for the sr-only summary', () => {
    const html = renderStatsPageHtml(createData(), t);
    // 8400 additions, 2100 deletions → total 10500 → 80% / 20%
    expect(html).toContain('80% additions, 20% deletions');
  });

  it('formats diff values that are missing as a dash', () => {
    const html = renderStatsPageHtml(
      createData({
        summary: {
          ...createData().summary,
          totalCommits: 0,
          averageCommits: '-',
          totalAdditions: 0,
          totalDeletions: 0,
        },
      }),
      t,
    );
    expect(html).toContain('stats-volume');
  });

  it('renders the review-period banner from the summary period', () => {
    const translate = (key: string, params?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        'stats.period': 'Reviews from {{from}} to {{to}} ({{days}} days)',
      };
      let value = table[key] ?? key;
      if (params) {
        for (const [param, replacement] of Object.entries(params)) {
          value = value.replaceAll(`{{${param}}}`, String(replacement));
        }
      }
      return value;
    };

    const html = renderStatsPageHtml(
      createData({
        summary: {
          ...createData().summary,
          period: { from: '12 Feb 2024', to: '23 Jun 2024', days: 132 },
        },
      }),
      translate,
    );

    expect(html).toContain('stats-period');
    expect(html).toContain('// PERIOD');
    expect(html).toContain('Reviews from 12 Feb 2024 to 23 Jun 2024 (132 days)');
  });

  it('omits the period banner when the summary has no period', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).not.toContain('stats-period');
  });
});
