import { describe, it, expect, beforeEach } from 'vitest';

import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import { persistAiInsightsResult } from '@/modules/statistics-insights/usecases/insights/persistAiInsights.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryInsightsGateway } from '@/tests/stubs/insights.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const validAiResult: AiInsightsResult = {
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

describe('persistAiInsightsResult', () => {
  let statsGateway: InMemoryStatsGateway;
  let insightsGateway: InMemoryInsightsGateway;

  beforeEach(() => {
    statsGateway = new InMemoryStatsGateway();
    insightsGateway = new InMemoryInsightsGateway();
  });

  it('should save AI insights into persisted data', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    persistAiInsightsResult({
      projectPath: '/test/project',
      aiInsights: validAiResult,
      statsGateway,
      insightsGateway,
    });

    const persisted = insightsGateway.loadPersistedInsights('/test/project');
    expect(persisted).not.toBeNull();
    expect(persisted?.aiInsights).toEqual(validAiResult);
  });

  it('should update review count at AI generation', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', mrNumber: 2, score: 7 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    persistAiInsightsResult({
      projectPath: '/test/project',
      aiInsights: validAiResult,
      statsGateway,
      insightsGateway,
    });

    const persisted = insightsGateway.loadPersistedInsights('/test/project');
    expect(persisted?.reviewCountAtAiGeneration).toBe(2);
  });

  it('should preserve existing persisted data when updating with AI insights', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    insightsGateway.savePersistedInsights('/test/project', {
      developers: [],
      processedReviewIds: ['r1'],
      lastUpdated: '2026-03-15T10:00:00Z',
      aiInsights: null,
      reviewCountAtAiGeneration: 0,
    });

    persistAiInsightsResult({
      projectPath: '/test/project',
      aiInsights: validAiResult,
      statsGateway,
      insightsGateway,
    });

    const persisted = insightsGateway.loadPersistedInsights('/test/project');
    expect(persisted?.processedReviewIds).toContain('r1');
    expect(persisted?.aiInsights).toEqual(validAiResult);
  });
});
