import { describe, it, expect, beforeEach } from 'vitest';

import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import { getInsightsWithAiStatus } from '@/modules/statistics-insights/usecases/insights/getInsightsWithAiStatus.usecase.js';
import {
  PersistedInsightsDataFactory,
  PersistedDeveloperMetricsFactory,
} from '@/tests/factories/persistedInsightsData.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryInsightsGateway } from '@/tests/stubs/insights.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const validAiInsights: AiInsightsResult = {
  developers: [
    {
      developerName: 'alice',
      title: 'Le Chirurgien du Code',
      titleExplanation: 'Precise and methodical',
      strengths: ['Excellent test coverage'],
      weaknesses: ['Slow review turnaround'],
      recommendations: ['Automate repetitive checks'],
      summary: 'Alice is a meticulous developer.',
    },
  ],
  team: {
    summary: 'A well-balanced team.',
    strengths: ['Strong testing culture'],
    weaknesses: ['Documentation gaps'],
    recommendations: ['Establish review guidelines'],
    dynamics: 'Good team dynamics.',
  },
  generatedAt: '2026-03-15T10:00:00Z',
};

describe('getInsightsWithAiStatus', () => {
  let statsGateway: InMemoryStatsGateway;
  let insightsGateway: InMemoryInsightsGateway;

  beforeEach(() => {
    statsGateway = new InMemoryStatsGateway();
    insightsGateway = new InMemoryInsightsGateway();
  });

  it('should return empty insights when no stats and no persisted data exist', () => {
    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.developerInsights).toEqual([]);
    expect(result.teamInsight.developerCount).toBe(0);
    expect(result.teamInsight.totalReviewCount).toBe(0);
    expect(result.aiInsights).toBeNull();
    expect(result.hasNewReviewsSinceAiGeneration).toBe(false);
  });

  it('should return persisted data insights when no stats exist but persisted data does', () => {
    const developers = [
      PersistedDeveloperMetricsFactory.create({
        developerName: 'alice',
        totalReviews: 5,
        recentReviews: [
          ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice' }),
          ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice' }),
          ReviewStatsFactory.create({ id: 'r3', assignedBy: 'alice' }),
          ReviewStatsFactory.create({ id: 'r4', assignedBy: 'alice' }),
          ReviewStatsFactory.create({ id: 'r5', assignedBy: 'alice' }),
        ],
      }),
    ];
    const persistedData = PersistedInsightsDataFactory.create({
      developers,
      processedReviewIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      aiInsights: validAiInsights,
      reviewCountAtAiGeneration: 5,
    });
    insightsGateway.savePersistedInsights('/test/project', persistedData);

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.aiInsights).toEqual(validAiInsights);
    expect(result.hasNewReviewsSinceAiGeneration).toBe(false);
  });

  it('should compute insights from stats when stats exist', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', score: 7 }),
      ReviewStatsFactory.create({ id: 'r3', assignedBy: 'alice', score: 9 }),
      ReviewStatsFactory.create({ id: 'r4', assignedBy: 'alice', score: 6 }),
      ReviewStatsFactory.create({ id: 'r5', assignedBy: 'alice', score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.developerInsights.length).toBeGreaterThanOrEqual(1);
    expect(result.aiInsights).toBeNull();
    expect(result.hasNewReviewsSinceAiGeneration).toBe(false);
  });

  it('should detect new reviews since AI generation', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', score: 7 }),
      ReviewStatsFactory.create({ id: 'r3', assignedBy: 'alice', score: 9 }),
      ReviewStatsFactory.create({ id: 'r4', assignedBy: 'alice', score: 6 }),
      ReviewStatsFactory.create({ id: 'r5', assignedBy: 'alice', score: 8 }),
      ReviewStatsFactory.create({ id: 'r6', assignedBy: 'alice', score: 7 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const persistedData = PersistedInsightsDataFactory.create({
      processedReviewIds: ['r1', 'r2', 'r3'],
      aiInsights: validAiInsights,
      reviewCountAtAiGeneration: 3,
    });
    insightsGateway.savePersistedInsights('/test/project', persistedData);

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.hasNewReviewsSinceAiGeneration).toBe(true);
    expect(result.aiInsights).toEqual(validAiInsights);
  });

  it('should return hasNewReviewsSinceAiGeneration false when no AI insights were generated', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', score: 7 }),
      ReviewStatsFactory.create({ id: 'r3', assignedBy: 'alice', score: 9 }),
      ReviewStatsFactory.create({ id: 'r4', assignedBy: 'alice', score: 6 }),
      ReviewStatsFactory.create({ id: 'r5', assignedBy: 'alice', score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const persistedData = PersistedInsightsDataFactory.create({
      processedReviewIds: ['r1', 'r2'],
      aiInsights: null,
      reviewCountAtAiGeneration: 0,
    });
    insightsGateway.savePersistedInsights('/test/project', persistedData);

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.hasNewReviewsSinceAiGeneration).toBe(false);
  });

  it('should return null aiInsights and false flag when no stats but persisted data has no AI insights', () => {
    const persistedData = PersistedInsightsDataFactory.create({
      processedReviewIds: ['r1', 'r2', 'r3'],
      aiInsights: null,
      reviewCountAtAiGeneration: 0,
    });
    insightsGateway.savePersistedInsights('/test/project', persistedData);

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.aiInsights).toBeNull();
    expect(result.hasNewReviewsSinceAiGeneration).toBe(false);
  });

  it('should detect new reviews since AI generation when no stats but persisted count is below processed reviews', () => {
    const persistedData = PersistedInsightsDataFactory.create({
      processedReviewIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      aiInsights: validAiInsights,
      reviewCountAtAiGeneration: 3,
    });
    insightsGateway.savePersistedInsights('/test/project', persistedData);

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.aiInsights).toEqual(validAiInsights);
    expect(result.hasNewReviewsSinceAiGeneration).toBe(true);
  });

  it('should persist null aiInsights and zero count when no stats but persisted data lacks AI insights', () => {
    const persistedData = PersistedInsightsDataFactory.create({
      processedReviewIds: ['r1'],
      aiInsights: null,
      reviewCountAtAiGeneration: 0,
    });
    insightsGateway.savePersistedInsights('/test/project', persistedData);

    getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    const saved = insightsGateway.loadPersistedInsights('/test/project');
    expect(saved?.aiInsights).toBeNull();
    expect(saved?.reviewCountAtAiGeneration).toBe(0);
  });

  it('should treat an empty reviews array as no stats and return empty insights', () => {
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews([]));

    const result = getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    expect(result.developerInsights).toEqual([]);
    expect(result.aiInsights).toBeNull();
    expect(result.hasNewReviewsSinceAiGeneration).toBe(false);
  });

  it('should save updated persisted data', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', score: 7 }),
      ReviewStatsFactory.create({ id: 'r3', assignedBy: 'alice', score: 9 }),
      ReviewStatsFactory.create({ id: 'r4', assignedBy: 'alice', score: 6 }),
      ReviewStatsFactory.create({ id: 'r5', assignedBy: 'alice', score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    getInsightsWithAiStatus({
      projectPath: '/test/project',
      statsGateway,
      insightsGateway,
    });

    const saved = insightsGateway.loadPersistedInsights('/test/project');
    expect(saved).not.toBeNull();
    expect(saved?.processedReviewIds).toContain('r1');
    expect(saved?.processedReviewIds).toContain('r5');
  });
});
