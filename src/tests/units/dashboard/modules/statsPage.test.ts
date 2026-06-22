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

  it('renders every chart canvas the page wires up', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('id="stats-score-trend"');
    expect(html).toContain('id="stats-activity"');
    expect(html).toContain('id="stats-distribution"');
    expect(html).toContain('id="stats-reviews-per-month"');
    expect(html).toContain('id="stats-bugs-category"');
  });

  it('builds a dev filter from the reviews', () => {
    const html = renderStatsPageHtml(createData(), t);
    expect(html).toContain('stats.allDevs');
    expect(html).toContain('alice');
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
});
