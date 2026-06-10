import { describe, expect, it } from 'vitest';

import { buildInsightsReport } from '@/dashboard/modules/insightsReport.js';

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

function createDeveloperViewModel(overrides = {}) {
  return {
    developerName: 'alice',
    title: 'architect',
    overallLevel: 7,
    categoryLevels: {
      quality: { level: 8, trend: 'improving' },
      responsiveness: { level: 6, trend: 'stable' },
      codeVolume: { level: 7, trend: 'stable' },
      iteration: { level: 5, trend: 'declining' },
    },
    strengths: ['quality'],
    weaknesses: ['iteration'],
    topPriority: 'iteration',
    reviewCount: 12,
    metrics: {
      averageScore: 7.5,
      averageBlocking: 1.2,
      firstReviewQualityRate: 0.75,
      averageDuration: '15m',
      averageWarnings: 2.1,
      averageAdditions: 120,
      averageDeletions: 30,
    },
    insightDescriptions: [],
    ...overrides,
  };
}

function createTeamViewModel(overrides = {}) {
  return {
    developerCount: 2,
    totalReviewCount: 24,
    averageLevels: { quality: 7, responsiveness: 6, codeVolume: 5, iteration: 6 },
    strengths: ['quality'],
    weaknesses: ['codeVolume'],
    tips: ['Focus on code volume reduction'],
    ...overrides,
  };
}

function createInsightsData(overrides = {}) {
  return {
    isEmpty: false,
    developers: [createDeveloperViewModel()],
    team: createTeamViewModel(),
    ...overrides,
  };
}

describe('buildInsightsReport', () => {
  const translate = createTranslate();

  it('should return a complete HTML document with html, head, and body tags', () => {
    const data = createInsightsData();

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<style>');
    expect(html).toContain('<body>');
    expect(html).toContain('</html>');
  });

  it('should render report header with title and generation date', () => {
    const data = createInsightsData();

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('export.title');
    expect(html).toContain('export.generatedAt');
  });

  it('should render team section with strengths and weaknesses', () => {
    const data = createInsightsData({
      team: createTeamViewModel({
        strengths: ['quality', 'responsiveness'],
        weaknesses: ['codeVolume'],
      }),
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('export.teamSection');
    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
    expect(html).toContain('category.codeVolume');
  });

  it('should render team tips when present', () => {
    const data = createInsightsData({
      team: createTeamViewModel({
        tips: ['Improve iteration speed', 'Break down large PRs'],
      }),
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('Improve iteration speed');
    expect(html).toContain('Break down large PRs');
  });

  it('should render AI team analysis when AI insights are available', () => {
    const data = createInsightsData({
      aiInsights: {
        developers: [],
        team: {
          summary: 'Strong team with good dynamics.',
          strengths: ['Consistent quality'],
          weaknesses: ['Slow turnaround'],
          recommendations: ['Automate more'],
          dynamics: 'Well balanced.',
        },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('Strong team with good dynamics.');
    expect(html).toContain('Consistent quality');
    expect(html).toContain('Slow turnaround');
    expect(html).toContain('Automate more');
    expect(html).toContain('Well balanced.');
  });

  it('should render developer sections with name and title', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({ developerName: 'alice', title: 'architect' }),
        createDeveloperViewModel({ developerName: 'bob', title: 'firefighter', overallLevel: 5 }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('alice');
    expect(html).toContain('bob');
    expect(html).toContain('title.architect');
    expect(html).toContain('title.firefighter');
  });

  it('should sort developers by overall level descending', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({ developerName: 'low-dev', overallLevel: 3 }),
        createDeveloperViewModel({ developerName: 'high-dev', overallLevel: 9 }),
        createDeveloperViewModel({ developerName: 'mid-dev', overallLevel: 6 }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    const highIndex = html.indexOf('high-dev');
    const midIndex = html.indexOf('mid-dev');
    const lowIndex = html.indexOf('low-dev');
    expect(highIndex).toBeLessThan(midIndex);
    expect(midIndex).toBeLessThan(lowIndex);
  });

  it('should render overall level for each developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ overallLevel: 9 })],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('export.overallLevel');
    expect(html).toContain('9');
  });

  it('should render category level bars for each developer', () => {
    const data = createInsightsData();

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
    expect(html).toContain('category.codeVolume');
    expect(html).toContain('category.iteration');
    expect(html).toContain('print-level-bar');
  });

  it('should render level bar with correct width percentage', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          categoryLevels: {
            quality: { level: 8, trend: 'stable' },
            responsiveness: { level: 6, trend: 'stable' },
            codeVolume: { level: 7, trend: 'stable' },
            iteration: { level: 5, trend: 'stable' },
          },
        }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('width: 80%');
    expect(html).toContain('8/10');
  });

  it('should use correct colors for level bars based on level value', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          categoryLevels: {
            quality: { level: 9, trend: 'stable' },
            responsiveness: { level: 7, trend: 'stable' },
            codeVolume: { level: 5, trend: 'stable' },
            iteration: { level: 2, trend: 'stable' },
          },
        }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('#22c55e');
    expect(html).toContain('#3b82f6');
    expect(html).toContain('#f59e0b');
    expect(html).toContain('#ef4444');
  });

  it('should render developer metrics when available', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          metrics: {
            averageScore: 7.5,
            averageBlocking: 1.2,
            firstReviewQualityRate: 0.75,
            averageDuration: '15m',
            averageWarnings: 2.1,
            averageAdditions: 120,
            averageDeletions: 30,
          },
        }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('export.metrics');
    expect(html).toContain('export.avgScore');
    expect(html).toContain('7.5');
    expect(html).toContain('export.avgBlocking');
    expect(html).toContain('1.2');
    expect(html).toContain('export.firstPassRate');
    expect(html).toContain('75%');
    expect(html).toContain('export.avgDuration');
    expect(html).toContain('15m');
  });

  it('should render developer strengths list', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          strengths: ['quality', 'responsiveness'],
        }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('team.strengths');
    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
  });

  it('should render developer weaknesses list', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          weaknesses: ['iteration', 'codeVolume'],
        }),
      ],
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('team.weaknesses');
    expect(html).toContain('category.iteration');
    expect(html).toContain('category.codeVolume');
  });

  it('should render AI developer title when AI insights exist for developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'alice' })],
      aiInsights: {
        developers: [
          {
            developerName: 'alice',
            title: 'The Quality Guardian',
            titleExplanation: 'High scores',
            strengths: ['Clean code'],
            weaknesses: ['Slow reviews'],
            recommendations: ['Speed up'],
            summary: 'Alice is great.',
          },
        ],
        team: { summary: '', strengths: [], weaknesses: [], recommendations: [], dynamics: '' },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('The Quality Guardian');
  });

  it('should render AI recommendations for developer when available', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'alice' })],
      aiInsights: {
        developers: [
          {
            developerName: 'alice',
            title: 'Title',
            titleExplanation: 'Reason',
            strengths: ['Clean code'],
            weaknesses: ['Large PRs'],
            recommendations: ['Break down changes', 'Add more tests'],
            summary: 'Profile text.',
          },
        ],
        team: { summary: '', strengths: [], weaknesses: [], recommendations: [], dynamics: '' },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('ai.recommendations');
    expect(html).toContain('Break down changes');
    expect(html).toContain('Add more tests');
  });

  it('should render AI summary for developer when available', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'alice' })],
      aiInsights: {
        developers: [
          {
            developerName: 'alice',
            title: 'Title',
            titleExplanation: 'Reason',
            strengths: [],
            weaknesses: [],
            recommendations: [],
            summary: 'Alice is a thorough developer who prioritizes code quality.',
          },
        ],
        team: { summary: '', strengths: [], weaknesses: [], recommendations: [], dynamics: '' },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('Alice is a thorough developer who prioritizes code quality.');
  });

  it('should render footer with generated by text', () => {
    const data = createInsightsData();

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('export.generatedBy');
  });

  it('should contain print-optimized styles', () => {
    const data = createInsightsData();

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('page-break-inside');
    expect(html).toContain('@media print');
  });

  it('should render developer section title', () => {
    const data = createInsightsData();

    const html = buildInsightsReport(data, translate);

    expect(html).toContain('export.developerSection');
  });
});
