import { describe, it, expect } from 'vitest';

import type { DeveloperInsight } from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import { computeTeamInsights } from '@/modules/statistics-insights/usecases/insights/computeTeamInsights.usecase.js';
import { DeveloperInsightFactory } from '@/tests/factories/developerInsight.factory.js';

describe('computeTeamInsights', () => {
  it('should return empty team insight when no developers provided', () => {
    const result = computeTeamInsights([]);

    expect(result.developerCount).toBe(0);
    expect(result.totalReviewCount).toBe(0);
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.tips).toEqual([]);
  });

  it('should count developers and total reviews', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        reviewCount: 10,
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        reviewCount: 8,
      }),
    ];

    const result = computeTeamInsights(insights);

    expect(result.developerCount).toBe(2);
    expect(result.totalReviewCount).toBe(18);
  });

  it('should compute average levels across all developers', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        categoryLevels: {
          quality: { level: 8, trend: 'stable' },
          responsiveness: { level: 6, trend: 'stable' },
          codeVolume: { level: 4, trend: 'stable' },
          iteration: { level: 7, trend: 'stable' },
        },
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        categoryLevels: {
          quality: { level: 6, trend: 'stable' },
          responsiveness: { level: 8, trend: 'stable' },
          codeVolume: { level: 6, trend: 'stable' },
          iteration: { level: 5, trend: 'stable' },
        },
      }),
    ];

    const result = computeTeamInsights(insights);

    expect(result.averageLevels.quality).toBe(7);
    expect(result.averageLevels.responsiveness).toBe(7);
    expect(result.averageLevels.codeVolume).toBe(5);
    expect(result.averageLevels.iteration).toBe(6);
  });

  it('should identify team strengths when average level >= 7', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        categoryLevels: {
          quality: { level: 8, trend: 'stable' },
          responsiveness: { level: 8, trend: 'stable' },
          codeVolume: { level: 3, trend: 'stable' },
          iteration: { level: 3, trend: 'stable' },
        },
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        categoryLevels: {
          quality: { level: 8, trend: 'stable' },
          responsiveness: { level: 6, trend: 'stable' },
          codeVolume: { level: 4, trend: 'stable' },
          iteration: { level: 4, trend: 'stable' },
        },
      }),
    ];

    const result = computeTeamInsights(insights);

    expect(result.strengths).toContain('quality');
  });

  it('should identify team weaknesses when average level <= 4', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        categoryLevels: {
          quality: { level: 8, trend: 'stable' },
          responsiveness: { level: 3, trend: 'stable' },
          codeVolume: { level: 3, trend: 'stable' },
          iteration: { level: 7, trend: 'stable' },
        },
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        categoryLevels: {
          quality: { level: 7, trend: 'stable' },
          responsiveness: { level: 4, trend: 'stable' },
          codeVolume: { level: 3, trend: 'stable' },
          iteration: { level: 6, trend: 'stable' },
        },
      }),
    ];

    const result = computeTeamInsights(insights);

    expect(result.weaknesses).toContain('codeVolume');
  });

  it('should generate tips based on team patterns', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        categoryLevels: {
          quality: { level: 3, trend: 'declining' },
          responsiveness: { level: 5, trend: 'stable' },
          codeVolume: { level: 5, trend: 'stable' },
          iteration: { level: 5, trend: 'stable' },
        },
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        categoryLevels: {
          quality: { level: 3, trend: 'declining' },
          responsiveness: { level: 5, trend: 'stable' },
          codeVolume: { level: 5, trend: 'stable' },
          iteration: { level: 5, trend: 'stable' },
        },
      }),
    ];

    const result = computeTeamInsights(insights);

    expect(result.tips.length).toBeGreaterThan(0);
  });

  it('should produce valid average levels between 1 and 10', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        categoryLevels: {
          quality: { level: 1, trend: 'stable' },
          responsiveness: { level: 10, trend: 'stable' },
          codeVolume: { level: 5, trend: 'stable' },
          iteration: { level: 5, trend: 'stable' },
        },
      }),
      DeveloperInsightFactory.createValid({
        developerName: 'bob',
        categoryLevels: {
          quality: { level: 10, trend: 'stable' },
          responsiveness: { level: 1, trend: 'stable' },
          codeVolume: { level: 5, trend: 'stable' },
          iteration: { level: 5, trend: 'stable' },
        },
      }),
    ];

    const result = computeTeamInsights(insights);

    for (const level of Object.values(result.averageLevels)) {
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(10);
    }
  });

  it('should handle single developer team', () => {
    const insights: DeveloperInsight[] = [
      DeveloperInsightFactory.createValid({
        developerName: 'alice',
        reviewCount: 10,
        categoryLevels: {
          quality: { level: 8, trend: 'stable' },
          responsiveness: { level: 7, trend: 'stable' },
          codeVolume: { level: 6, trend: 'stable' },
          iteration: { level: 5, trend: 'stable' },
        },
      }),
    ];

    const result = computeTeamInsights(insights);

    expect(result.developerCount).toBe(1);
    expect(result.averageLevels.quality).toBe(8);
  });
});
