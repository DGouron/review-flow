import { describe, it, expect, beforeEach } from 'vitest';

import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import { generateAiInsightsViaSession } from '@/modules/statistics-insights/usecases/insights/generateAiInsightsViaSession.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubAiInsightsSessionGateway } from '@/tests/stubs/aiInsightsSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
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

describe('generateAiInsightsViaSession', () => {
  let statsGateway: InMemoryStatsGateway;
  let reviewFileGateway: InMemoryReviewFileGateway;
  let reviewRequestTrackingGateway: InMemoryReviewRequestTrackingGateway;
  let environment: StubEnvironmentGateway;
  let session: StubAiInsightsSessionGateway;

  function input() {
    return {
      projectPath: '/test/project',
      statsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      session,
      environment,
      language: 'fr' as const,
    };
  }

  function seedReviews(): void {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));
  }

  beforeEach(() => {
    statsGateway = new InMemoryStatsGateway();
    reviewFileGateway = new InMemoryReviewFileGateway();
    reviewRequestTrackingGateway = new InMemoryReviewRequestTrackingGateway();
    environment = new StubEnvironmentGateway();
    session = new StubAiInsightsSessionGateway();
  });

  it('returns insights parsed from the completed --bg session answer', async () => {
    seedReviews();
    session.setResult({ status: 'completed', answer: JSON.stringify(validAiResult) });

    const result = await generateAiInsightsViaSession(input());

    expect(result.developers).toHaveLength(1);
    expect(result.developers[0].developerName).toBe('alice');
    expect(result.team.summary).toBe('A well-balanced team.');
    expect(result.generatedAt).toBeDefined();
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  it('parses an answer wrapped in markdown fences', async () => {
    seedReviews();
    session.setResult({
      status: 'completed',
      answer: '```json\n' + JSON.stringify(validAiResult) + '\n```',
    });

    const result = await generateAiInsightsViaSession(input());

    expect(result.developers).toHaveLength(1);
  });

  it('sends the prompt with review content and tracked data to the session', async () => {
    seedReviews();
    reviewFileGateway.addReview(
      '/test/project',
      '2026-03-13-MR-1-review.md',
      '# Code Review - MR !1\n\n## Synthèse Exécutive\n\n| Audit | Score |\n|---|---|\n| Testing | 9/10 |\n\n**Score Global : 8/10**\n\n## Constats Positifs\n\n### 1. Great test coverage\n',
    );
    session.setResult({ status: 'completed', answer: JSON.stringify(validAiResult) });

    await generateAiInsightsViaSession(input());

    expect(session.runCalls).toHaveLength(1);
    expect(session.runCalls[0]).toContain('Synthèse Exécutive');
  });

  it('forwards the project path to the session so it dispatches in the target project', async () => {
    seedReviews();
    session.setResult({ status: 'completed', answer: JSON.stringify(validAiResult) });

    await generateAiInsightsViaSession(input());

    expect(session.projectPaths).toEqual(['/test/project']);
  });

  it('refuses when an Anthropic API key is present (subscription-only safeguard)', async () => {
    seedReviews();
    environment.setHasAnthropicApiKey(true);

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      "Impossible de générer les insights — l'abonnement Claude est requis, pas de clé API",
    );
    expect(session.runCalls).toHaveLength(0);
  });

  it('rejects in French when no review stats exist', async () => {
    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      'Aucune statistique de review disponible pour ce projet',
    );
  });

  it('rejects in French when the subscription session is unavailable (logged out)', async () => {
    seedReviews();
    session.setResult({ status: 'unavailable', reason: 'dispatch-failed' });

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      "Impossible de générer les insights — connexion à l'abonnement Claude requise",
    );
  });

  it('rejects in French when the session times out', async () => {
    seedReviews();
    session.setResult({ status: 'timed-out' });

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      'La génération des insights a expiré',
    );
  });

  it('throws when the completed answer is not valid JSON', async () => {
    seedReviews();
    session.setResult({ status: 'completed', answer: 'this is not JSON' });

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow();
  });
});
