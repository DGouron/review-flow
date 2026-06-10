import { describe, it, expect } from 'vitest';

import type { DeveloperInsight } from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import { InsightsPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/insights.presenter.js';
import { DeveloperInsightFactory } from '@/tests/factories/developerInsight.factory.js';
import { TeamInsightFactory } from '@/tests/factories/teamInsight.factory.js';

describe('InsightsPresenter', () => {
  const presenter = new InsightsPresenter();

  it('should present empty state when no developers', () => {
    const developerInsights: DeveloperInsight[] = [];
    const teamInsight = TeamInsightFactory.createValid({
      developerCount: 0,
      totalReviewCount: 0,
      strengths: [],
      weaknesses: [],
      tips: [],
    });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.developers).toEqual([]);
  });

  it('should present developer cards sorted by overall level descending', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        overallLevel: 5,
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        overallLevel: 8,
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'charlie',
        overallLevel: 6,
      }),
    ];
    const teamInsight = TeamInsightFactory.createValid({ developerCount: 3 });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    expect(viewModel.developers[0].developerName).toBe('bob');
    expect(viewModel.developers[1].developerName).toBe('charlie');
    expect(viewModel.developers[2].developerName).toBe('alice');
  });

  it('should include all category levels for each developer', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        categoryLevels: {
          quality: { level: 8, trend: 'improving' },
          responsiveness: { level: 6, trend: 'stable' },
          codeVolume: { level: 7, trend: 'stable' },
          iteration: { level: 5, trend: 'declining' },
        },
      }),
    ];
    const teamInsight = TeamInsightFactory.createValid({ developerCount: 1 });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    const alice = viewModel.developers[0];
    expect(alice.categoryLevels.quality.level).toBe(8);
    expect(alice.categoryLevels.quality.trend).toBe('improving');
    expect(alice.categoryLevels.responsiveness.level).toBe(6);
    expect(alice.categoryLevels.iteration.trend).toBe('declining');
  });

  it('should present team insights section', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({ developerName: 'alice' }),
    ];
    const teamInsight = TeamInsightFactory.createValid({
      developerCount: 1,
      strengths: ['quality'],
      weaknesses: ['responsiveness'],
      tips: ['Improve response times'],
    });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    expect(viewModel.team.strengths).toContain('quality');
    expect(viewModel.team.weaknesses).toContain('responsiveness');
    expect(viewModel.team.tips).toContain('Improve response times');
  });

  it('should include developer title in view model', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        title: 'architect',
      }),
    ];
    const teamInsight = TeamInsightFactory.createValid({ developerCount: 1 });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    expect(viewModel.developers[0].title).toBe('architect');
  });

  it('should include review count and strengths/weaknesses', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        reviewCount: 15,
        strengths: ['quality', 'responsiveness'],
        weaknesses: ['iteration'],
        topPriority: 'iteration',
      }),
    ];
    const teamInsight = TeamInsightFactory.createValid({ developerCount: 1 });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    const alice = viewModel.developers[0];
    expect(alice.reviewCount).toBe(15);
    expect(alice.strengths).toEqual(['quality', 'responsiveness']);
    expect(alice.weaknesses).toEqual(['iteration']);
    expect(alice.topPriority).toBe('iteration');
  });

  it('should include metrics in developer view model', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        metrics: {
          averageScore: 8.3,
          averageBlocking: 0.1,
          averageWarnings: 1.4,
          averageDuration: 60000,
          totalFollowups: null,
          averageAdditions: 200,
          averageDeletions: 50,
          firstReviewQualityRate: 0.85,
        },
      }),
    ];
    const teamInsight = TeamInsightFactory.createValid({ developerCount: 1 });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    const alice = viewModel.developers[0];
    expect(alice.metrics).toBeDefined();
    expect(alice.metrics.averageScore).toBe(8.3);
    expect(alice.metrics.averageBlocking).toBe(0.1);
    expect(alice.metrics.firstReviewQualityRate).toBe(0.85);
  });

  it('should include insight descriptions in developer view model', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        insightDescriptions: [
          {
            category: 'quality',
            type: 'strength',
            descriptionKey: 'insight.quality.highScore',
            params: { score: 8.3, teamAverage: 7.5, percent: 11 },
          },
        ],
      }),
    ];
    const teamInsight = TeamInsightFactory.createValid({ developerCount: 1 });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    const alice = viewModel.developers[0];
    expect(alice.insightDescriptions).toHaveLength(1);
    expect(alice.insightDescriptions[0].descriptionKey).toBe('insight.quality.highScore');
  });

  it('should include team average levels', () => {
    const developerInsights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({ developerName: 'alice' }),
    ];
    const teamInsight = TeamInsightFactory.createValid({
      developerCount: 1,
      averageLevels: {
        quality: 7,
        responsiveness: 5,
        codeVolume: 6,
        iteration: 4,
      },
    });

    const viewModel = presenter.present({
      developerInsights,
      teamInsight,
    });

    expect(viewModel.team.averageLevels.quality).toBe(7);
    expect(viewModel.team.averageLevels.iteration).toBe(4);
  });
});
