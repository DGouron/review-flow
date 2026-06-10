import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import { insightsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/insights.routes.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubAiInsightsSessionGateway } from '@/tests/stubs/aiInsightsSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { InMemoryInsightsGateway } from '@/tests/stubs/insights.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
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

describe('insights routes', () => {
  let app: FastifyInstance;
  let statsGateway: InMemoryStatsGateway;
  let insightsGateway: InMemoryInsightsGateway;
  let reviewFileGateway: InMemoryReviewFileGateway;
  let reviewRequestTrackingGateway: InMemoryReviewRequestTrackingGateway;

  beforeEach(async () => {
    app = Fastify();
    statsGateway = new InMemoryStatsGateway();
    insightsGateway = new InMemoryInsightsGateway();
    reviewFileGateway = new InMemoryReviewFileGateway();
    reviewRequestTrackingGateway = new InMemoryReviewRequestTrackingGateway();
    const session = new StubAiInsightsSessionGateway();
    session.setResult({ status: 'completed', answer: JSON.stringify(validAiResult) });
    await app.register(insightsRoutes, {
      statsGateway,
      insightsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      session,
      environment: new StubEnvironmentGateway(),
      language: 'fr',
    });
    await app.ready();
  });

  it('should return 400 when path query parameter is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/insights',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  it('should return empty insights when project has no stats', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/insights?path=/nonexistent/project',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isEmpty).toBe(true);
    expect(body.developers).toEqual([]);
  });

  it('should return empty insights when project has no reviews', async () => {
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews: [] }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/insights?path=/test/project',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isEmpty).toBe(true);
  });

  it('should return developer insights for eligible developers', async () => {
    const reviews = Array.from({ length: 6 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `alice-${index}`,
        assignedBy: 'alice',
        mrNumber: index + 1,
        score: 8,
        blocking: 0,
        warnings: 1,
        duration: 60000,
      }),
    );
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const response = await app.inject({
      method: 'GET',
      url: '/api/insights?path=/test/project',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isEmpty).toBe(false);
    expect(body.developers).toHaveLength(1);
    expect(body.developers[0].developerName).toBe('alice');
  });

  it('should return team insights section', async () => {
    const aliceReviews = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `alice-${index}`,
        assignedBy: 'alice',
        mrNumber: index + 1,
        score: 8,
      }),
    );
    const bobReviews = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `bob-${index}`,
        assignedBy: 'bob',
        mrNumber: index + 10,
        score: 6,
      }),
    );
    statsGateway.saveProjectStats(
      '/test/project',
      ProjectStatsFactory.withReviews([...aliceReviews, ...bobReviews]),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/insights?path=/test/project',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.team).toBeDefined();
    expect(body.team.developerCount).toBe(2);
    expect(body.team.averageLevels).toBeDefined();
  });

  it('should reject paths with directory traversal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/insights?path=/../etc/passwd',
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject relative paths', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/insights?path=relative/path',
    });

    expect(response.statusCode).toBe(400);
  });

  describe('persistence behavior', () => {
    it('should save persisted insights data after computing', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-persist-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
          blocking: 0,
          warnings: 1,
          duration: 60000,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      const persisted = insightsGateway.loadPersistedInsights('/test/project');
      expect(persisted).not.toBeNull();
      expect(persisted?.developers).toHaveLength(1);
      expect(persisted?.processedReviewIds).toHaveLength(6);
    });

    it('should use persisted data on subsequent requests', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      const newReview = ReviewStatsFactory.create({
        id: 'alice-new',
        assignedBy: 'alice',
        mrNumber: 100,
        score: 9,
      });
      statsGateway.saveProjectStats(
        '/test/project',
        ProjectStatsFactory.withReviews([...reviews, newReview]),
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.developers[0].reviewCount).toBe(7);

      const persisted = insightsGateway.loadPersistedInsights('/test/project');
      expect(persisted?.processedReviewIds).toContain('alice-new');
    });

    it('should not save persisted data when no stats exist', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/insights?path=/empty/project',
      });

      const persisted = insightsGateway.loadPersistedInsights('/empty/project');
      expect(persisted).toBeNull();
    });
  });

  describe('POST /api/insights/generate', () => {
    it('should return 400 when path is missing from body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when path is a relative path', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: 'relative/path' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when path contains directory traversal', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/../etc/passwd' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return AI insights when project has stats', async () => {
      const reviews = [
        ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
      ];
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      const response = await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/test/project' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.developers).toBeDefined();
      expect(body.team).toBeDefined();
      expect(body.generatedAt).toBeDefined();
    });

    it('should persist AI insights after generation', async () => {
      const reviews = [
        ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
      ];
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/test/project' },
      });

      const persisted = insightsGateway.loadPersistedInsights('/test/project');
      expect(persisted).not.toBeNull();
      expect(persisted?.aiInsights).not.toBeNull();
      expect(persisted?.aiInsights?.developers).toHaveLength(1);
    });

    it('should return 500 when project has no stats', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/empty/project' },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /api/insights with aiInsights', () => {
    it('should return null aiInsights when not generated', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
          blocking: 0,
          warnings: 1,
          duration: 60000,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      const response = await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.aiInsights).toBeNull();
    });

    it('should return aiInsights when previously generated', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
          blocking: 0,
          warnings: 1,
          duration: 60000,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/test/project' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.aiInsights).not.toBeNull();
      expect(body.aiInsights.developers).toHaveLength(1);
    });

    it('should return hasNewReviewsSinceAiGeneration false when no new reviews', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
          blocking: 0,
          warnings: 1,
          duration: 60000,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/test/project' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.hasNewReviewsSinceAiGeneration).toBe(false);
    });

    it('should return hasNewReviewsSinceAiGeneration true when new reviews arrived', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
          blocking: 0,
          warnings: 1,
          duration: 60000,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      await app.inject({
        method: 'POST',
        url: '/api/insights/generate',
        payload: { path: '/test/project' },
      });

      const newReview = ReviewStatsFactory.create({
        id: 'alice-new-after-ai',
        assignedBy: 'alice',
        mrNumber: 100,
        score: 9,
      });
      statsGateway.saveProjectStats(
        '/test/project',
        ProjectStatsFactory.withReviews([...reviews, newReview]),
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.hasNewReviewsSinceAiGeneration).toBe(true);
    });

    it('should return hasNewReviewsSinceAiGeneration false when no AI insights exist', async () => {
      const reviews = Array.from({ length: 6 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 8,
          blocking: 0,
          warnings: 1,
          duration: 60000,
        }),
      );
      statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

      const response = await app.inject({
        method: 'GET',
        url: '/api/insights?path=/test/project',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.hasNewReviewsSinceAiGeneration).toBe(false);
    });
  });
});
