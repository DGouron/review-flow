import { describe, expect, it } from 'vitest';

import { renderDeveloperSheetContent } from '@/dashboard/modules/developerSheet.js';

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

describe('renderDeveloperSheetContent', () => {
  const translate = createTranslate();

  it('should render close button and developer name', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('sheet-close');
    expect(html).toContain('closeDevSheet');
    expect(html).toContain('alice');
  });

  it('should render developer title', () => {
    const developer = createDeveloperViewModel({ title: 'sentinel' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('title.sentinel');
  });

  it('should render overall level prominently', () => {
    const developer = createDeveloperViewModel({ overallLevel: 9 });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('dev-level-ring');
    expect(html).toContain('ring-value');
    expect(html).toContain('9');
  });

  it('should render radar chart canvas', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('canvas');
    expect(html).toContain('dev-radar-canvas');
  });

  it('should render stat bars for all four categories', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
    expect(html).toContain('category.codeVolume');
    expect(html).toContain('category.iteration');
    expect(html).toContain('stat-bar');
  });

  it('should render strengths list', () => {
    const developer = createDeveloperViewModel({ strengths: ['quality', 'responsiveness'] });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.strengths');
    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
  });

  it('should render weaknesses list', () => {
    const developer = createDeveloperViewModel({ weaknesses: ['iteration', 'codeVolume'] });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.weaknesses');
    expect(html).toContain('category.iteration');
    expect(html).toContain('category.codeVolume');
  });

  it('should render top priority when present', () => {
    const developer = createDeveloperViewModel({ topPriority: 'iteration' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.topPriority');
    expect(html).toContain('category.iteration');
  });

  it('should render no priority message when topPriority is null', () => {
    const developer = createDeveloperViewModel({ topPriority: null });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.noTopPriority');
  });

  it('should render review count badge', () => {
    const developer = createDeveloperViewModel({ reviewCount: 25 });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.reviewCount');
  });

  it('should render avatar placeholder with initial', () => {
    const developer = createDeveloperViewModel({ developerName: 'bob' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('dev-sheet-avatar');
    expect(html).toContain('B');
  });

  it('should render score trend canvas for developer chart', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('canvas');
    expect(html).toContain('dev-score-trend-canvas');
    expect(html).toContain('devSheet.scoreTrend');
  });

  it('should use AI title when aiDeveloper is provided', () => {
    const developer = createDeveloperViewModel({ title: 'architect' });
    const aiDeveloper = {
      developerName: 'alice',
      title: 'The Quality Guardian',
      titleExplanation: 'Consistently delivers high-quality code',
      strengths: ['Clean code'],
      weaknesses: ['Large PRs'],
      recommendations: ['Break down changes'],
      summary: 'Alice is a strong developer',
    };

    const html = renderDeveloperSheetContent(developer, translate, aiDeveloper);

    expect(html).toContain('The Quality Guardian');
    expect(html).toContain('ai-title');
    expect(html).toContain('ai.titleExplanation');
    expect(html).toContain('Consistently delivers high-quality code');
  });

  it('should fall back to deterministic title when no AI developer', () => {
    const developer = createDeveloperViewModel({ title: 'sentinel' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('title.sentinel');
    expect(html).not.toContain('ai-title');
  });

  it('should render AI analysis section when aiDeveloper is provided', () => {
    const developer = createDeveloperViewModel();
    const aiDeveloper = {
      developerName: 'alice',
      title: 'The Quality Guardian',
      titleExplanation: 'High scores',
      strengths: ['Clean architecture', 'Good naming'],
      weaknesses: ['Slow reviews', 'Large changes'],
      recommendations: ['Review faster', 'Split PRs'],
      summary: 'Alice is a thorough developer who focuses on code quality.',
    };

    const html = renderDeveloperSheetContent(developer, translate, aiDeveloper);

    expect(html).toContain('ai-section');
    expect(html).toContain('ai.section');
    expect(html).toContain('ai.summary');
    expect(html).toContain('Alice is a thorough developer who focuses on code quality.');
    expect(html).toContain('Clean architecture');
    expect(html).toContain('Good naming');
    expect(html).toContain('Slow reviews');
    expect(html).toContain('Large changes');
    expect(html).toContain('Review faster');
    expect(html).toContain('Split PRs');
  });

  it('should render AI strengths and weaknesses with appropriate labels', () => {
    const developer = createDeveloperViewModel();
    const aiDeveloper = {
      developerName: 'alice',
      title: 'Title',
      titleExplanation: 'Reason',
      strengths: ['Excellent testing'],
      weaknesses: ['Missing docs'],
      recommendations: ['Add documentation'],
      summary: 'Profile text',
    };

    const html = renderDeveloperSheetContent(developer, translate, aiDeveloper);

    expect(html).toContain('ai.strengths');
    expect(html).toContain('ai.weaknesses');
    expect(html).toContain('ai.recommendations');
  });

  it('should show prompt to generate AI insights when no aiDeveloper', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('ai.noInsights');
  });

  it('should render metrics as stat cards with values', () => {
    const developer = createDeveloperViewModel({
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
    });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('sheet-stat-card');
    expect(html).toContain('dev-score');
    expect(html).toContain('8.3');
    expect(html).toContain('dev-blocking');
    expect(html).toContain('0.1');
    expect(html).toContain('dev-warnings');
    expect(html).toContain('1.4');
    expect(html).toContain('dev-quality');
    expect(html).toContain('90');
  });

  it('should not render metrics section when metrics is null', () => {
    const developer = createDeveloperViewModel({ metrics: null });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).not.toContain('sheet-stat-card');
    expect(html).not.toContain('sheet-stats-grid');
  });

  it('should render strengths and weaknesses side by side in insights grid', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('dev-sheet-insights-grid');
  });
});
