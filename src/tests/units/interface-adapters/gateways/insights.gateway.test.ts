import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import { FileSystemInsightsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/insights.fileSystem.js';

describe('FileSystemInsightsGateway', () => {
  let gateway: FileSystemInsightsGateway;
  let temporaryDirectory: string;

  beforeEach(() => {
    gateway = new FileSystemInsightsGateway();
    temporaryDirectory = join(tmpdir(), `insights-test-${Date.now()}`);
    mkdirSync(temporaryDirectory, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  describe('loadPersistedInsights', () => {
    it('should return null when file does not exist', () => {
      const result = gateway.loadPersistedInsights(temporaryDirectory);

      expect(result).toBeNull();
    });

    it('should load valid persisted insights data from file', () => {
      const insightsData: PersistedInsightsData = {
        developers: [],
        processedReviewIds: ['review-1'],
        lastUpdated: '2024-01-15T10:00:00Z',
        aiInsights: null,
        reviewCountAtAiGeneration: 0,
      };
      const insightsPath = join(temporaryDirectory, '.claude', 'reviews', 'insights.json');
      mkdirSync(join(temporaryDirectory, '.claude', 'reviews'), { recursive: true });
      writeFileSync(insightsPath, JSON.stringify(insightsData), 'utf-8');

      const result = gateway.loadPersistedInsights(temporaryDirectory);

      expect(result).toEqual(insightsData);
    });

    it('should return null when file contains invalid JSON', () => {
      const insightsPath = join(temporaryDirectory, '.claude', 'reviews', 'insights.json');
      mkdirSync(join(temporaryDirectory, '.claude', 'reviews'), { recursive: true });
      writeFileSync(insightsPath, 'not valid json', 'utf-8');

      const result = gateway.loadPersistedInsights(temporaryDirectory);

      expect(result).toBeNull();
    });
  });

  describe('savePersistedInsights', () => {
    it('should save persisted insights data to file', () => {
      const insightsData: PersistedInsightsData = {
        developers: [
          {
            developerName: 'alice',
            totalReviews: 10,
            totalScore: 75,
            scoredReviewCount: 9,
            totalBlocking: 5,
            totalWarnings: 12,
            totalSuggestions: 20,
            totalDuration: 600000,
            totalAdditions: 1500,
            totalDeletions: 300,
            diffStatsReviewCount: 8,
            recentReviews: [],
          },
        ],
        processedReviewIds: ['review-1'],
        lastUpdated: '2024-01-15T10:00:00Z',
        aiInsights: null,
        reviewCountAtAiGeneration: 0,
      };

      gateway.savePersistedInsights(temporaryDirectory, insightsData);

      const insightsPath = join(temporaryDirectory, '.claude', 'reviews', 'insights.json');
      expect(existsSync(insightsPath)).toBe(true);
      const content = readFileSync(insightsPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.developers).toHaveLength(1);
      expect(parsed.developers[0].developerName).toBe('alice');
    });

    it('should create directory structure if it does not exist', () => {
      const insightsData: PersistedInsightsData = {
        developers: [],
        processedReviewIds: [],
        lastUpdated: '2024-01-15T10:00:00Z',
        aiInsights: null,
        reviewCountAtAiGeneration: 0,
      };

      gateway.savePersistedInsights(temporaryDirectory, insightsData);

      const dirPath = join(temporaryDirectory, '.claude', 'reviews');
      expect(existsSync(dirPath)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should save and load the same data', () => {
      const insightsData: PersistedInsightsData = {
        developers: [
          {
            developerName: 'bob',
            totalReviews: 5,
            totalScore: 40,
            scoredReviewCount: 5,
            totalBlocking: 2,
            totalWarnings: 8,
            totalSuggestions: 10,
            totalDuration: 300000,
            totalAdditions: 800,
            totalDeletions: 200,
            diffStatsReviewCount: 5,
            recentReviews: [],
          },
        ],
        processedReviewIds: ['rev-1', 'rev-2'],
        lastUpdated: '2024-01-15T10:00:00Z',
        aiInsights: null,
        reviewCountAtAiGeneration: 0,
      };

      gateway.savePersistedInsights(temporaryDirectory, insightsData);
      const loaded = gateway.loadPersistedInsights(temporaryDirectory);

      expect(loaded).toEqual(insightsData);
    });
  });
});
