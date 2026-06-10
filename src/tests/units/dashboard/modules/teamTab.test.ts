import { describe, expect, it } from 'vitest';

import { renderTeamTab } from '@/dashboard/modules/teamTab.js';

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
      averageBlocking: 0.3,
      averageWarnings: 1.2,
      averageDuration: 300,
      totalFollowups: 5,
      averageAdditions: 50,
      averageDeletions: 20,
      firstReviewQualityRate: 0.8,
    },
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

describe('renderTeamTab', () => {
  const translate = createTranslate();

  it('should render empty state when data is empty', () => {
    const data = createInsightsData({ isEmpty: true, developers: [] });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team.noData');
    expect(html).toContain('empty-state');
  });

  it('should render developer cards when data has developers', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({ developerName: 'alice' }),
        createDeveloperViewModel({ developerName: 'bob', title: 'firefighter', overallLevel: 5 }),
      ],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('alice');
    expect(html).toContain('bob');
    expect(html).toContain('dev-card');
    expect(html).toContain('team-grid');
  });

  it('should render team insights section with strengths and weaknesses', () => {
    const data = createInsightsData();

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team-insights');
    expect(html).toContain('team.strengths');
    expect(html).toContain('team.weaknesses');
  });

  it('should render stat bars for each category', () => {
    const data = createInsightsData();

    const html = renderTeamTab(data, translate);

    expect(html).toContain('stat-bar');
    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
    expect(html).toContain('category.codeVolume');
    expect(html).toContain('category.iteration');
  });

  it('should render developer title translation key', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ title: 'sentinel' })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('title.sentinel');
  });

  it('should render overall level for each developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ overallLevel: 9 })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('dev-level-ring');
    expect(html).toContain('ring-value');
    expect(html).toContain('9');
  });

  it('should render review count for each developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ reviewCount: 15 })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('devSheet.reviewCount');
    expect(html).toContain('dev-chip-count');
  });

  it('should include onclick handler to open developer sheet', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'alice' })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('openDevSheet');
    expect(html).toContain('alice');
  });

  it('should render team tips when present', () => {
    const data = createInsightsData({
      team: createTeamViewModel({ tips: ['Improve iteration speed', 'Add more tests'] }),
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team.tips');
    expect(html).toContain('Improve iteration speed');
    expect(html).toContain('Add more tests');
  });

  it('should render trend indicators on stat bars', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          categoryLevels: {
            quality: { level: 8, trend: 'improving' },
            responsiveness: { level: 6, trend: 'declining' },
            codeVolume: { level: 7, trend: 'stable' },
            iteration: { level: 5, trend: 'improving' },
          },
        }),
      ],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('trend-improving');
    expect(html).toContain('trend-declining');
    expect(html).toContain('trend-stable');
  });

  it('should render AI generate button when no AI insights exist', () => {
    const data = createInsightsData({ aiInsights: null });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('ai-generate-btn');
    expect(html).toContain('generateAiInsights');
    expect(html).toContain('ai.generate');
  });

  it('should render refresh button with new data badge when hasNewReviewsSinceAiGeneration is true', () => {
    const data = createInsightsData({
      aiInsights: {
        developers: [],
        team: {
          summary: 'Team summary',
          strengths: [],
          weaknesses: [],
          recommendations: [],
          dynamics: 'Balanced',
        },
        generatedAt: '2026-03-15T10:00:00Z',
      },
      hasNewReviewsSinceAiGeneration: true,
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('ai-generate-btn');
    expect(html).toContain('ai.refresh');
    expect(html).toContain('ai-badge');
    expect(html).toContain('ai.newDataAvailable');
  });

  it('should render last generated date when AI insights are fresh', () => {
    const data = createInsightsData({
      aiInsights: {
        developers: [],
        team: {
          summary: 'Team summary',
          strengths: [],
          weaknesses: [],
          recommendations: [],
          dynamics: 'Balanced',
        },
        generatedAt: '2026-03-15T10:00:00Z',
      },
      hasNewReviewsSinceAiGeneration: false,
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('ai.lastGenerated');
    expect(html).toContain('ai-generate-btn');
  });

  it('should render AI team analysis card when AI team insights exist', () => {
    const data = createInsightsData({
      aiInsights: {
        developers: [],
        team: {
          summary: 'The team shows strong quality patterns.',
          strengths: ['Consistent code quality', 'Fast reviews'],
          weaknesses: ['Large code changes'],
          recommendations: ['Break down large PRs'],
          dynamics: 'Well balanced team with complementary skills.',
        },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('ai-team-card');
    expect(html).toContain('ai.teamAnalysis');
    expect(html).toContain('The team shows strong quality patterns.');
    expect(html).toContain('Consistent code quality');
    expect(html).toContain('Fast reviews');
    expect(html).toContain('Large code changes');
    expect(html).toContain('Break down large PRs');
    expect(html).toContain('Well balanced team with complementary skills.');
  });

  it('should use AI title on developer card when AI developer insights exist', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'alice', title: 'architect' })],
      aiInsights: {
        developers: [
          {
            developerName: 'alice',
            title: 'The Quality Guardian',
            titleExplanation: 'Consistently high scores',
            strengths: ['Clean code'],
            weaknesses: ['Slow reviews'],
            recommendations: ['Speed up'],
            summary: 'Alice is great',
          },
        ],
        team: {
          summary: 'Team',
          strengths: [],
          weaknesses: [],
          recommendations: [],
          dynamics: 'Good',
        },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('The Quality Guardian');
    expect(html).toContain('ai-title');
  });

  it('should fall back to deterministic title when no AI insights for developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'bob', title: 'firefighter' })],
      aiInsights: {
        developers: [
          {
            developerName: 'alice',
            title: 'The Quality Guardian',
            titleExplanation: 'Consistently high scores',
            strengths: [],
            weaknesses: [],
            recommendations: [],
            summary: 'Alice profile',
          },
        ],
        team: {
          summary: 'Team',
          strengths: [],
          weaknesses: [],
          recommendations: [],
          dynamics: 'Good',
        },
        generatedAt: '2026-03-15T10:00:00Z',
      },
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('title.firefighter');
    expect(html).not.toContain('The Quality Guardian');
  });

  it('should render export PDF button when data is not empty', () => {
    const data = createInsightsData();

    const html = renderTeamTab(data, translate);

    expect(html).toContain('export-pdf-btn');
    expect(html).toContain('exportInsightsPdf');
    expect(html).toContain('export.pdf');
  });

  it('should not render export PDF button on empty state', () => {
    const data = createInsightsData({ isEmpty: true, developers: [] });

    const html = renderTeamTab(data, translate);

    expect(html).not.toContain('export-pdf-btn');
    expect(html).not.toContain('exportInsightsPdf');
  });

  it('should render team health strip with developer count, review count and avg level', () => {
    const data = createInsightsData({
      team: createTeamViewModel({
        developerCount: 4,
        totalReviewCount: 100,
        averageLevels: { quality: 8, responsiveness: 6, codeVolume: 7, iteration: 7 },
      }),
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team-health-strip');
    expect(html).toContain('>4<');
    expect(html).toContain('>100<');
    expect(html).toContain('7.0');
    expect(html).toContain('tier-focus');
  });

  it('should render health strip with warning tier when avg level is low', () => {
    const data = createInsightsData({
      team: createTeamViewModel({
        averageLevels: { quality: 4, responsiveness: 5, codeVolume: 4, iteration: 3 },
      }),
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team-health-strip');
    expect(html).toContain('tier-warning');
  });

  it('should render metric chips with avg score and quality rate', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({
          metrics: {
            averageScore: 8.3,
            averageBlocking: 0.1,
            averageWarnings: 1.4,
            averageDuration: 300,
            totalFollowups: 2,
            averageAdditions: 40,
            averageDeletions: 15,
            firstReviewQualityRate: 0.9,
          },
        }),
      ],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('dev-chip-score');
    expect(html).toContain('8.3');
    expect(html).toContain('dev-chip-quality');
    expect(html).toContain('90%');
  });

  it('should not render metric chips when metrics is null', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ metrics: null })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).not.toContain('dev-chip-score');
    expect(html).not.toContain('dev-chip-quality');
    expect(html).toContain('dev-chip-count');
  });

  it('should render health strip tooltips with translated text', () => {
    const data = createInsightsData();

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team.healthStrip.developers');
    expect(html).toContain('team.healthStrip.reviews');
    expect(html).toContain('team.healthStrip.avgLevel');
  });
});
