import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

describe('SPEC-191: Team AI Insights migrated to --bg subscription billing', () => {
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

  it('nominal: generates insights via a --bg session with identical content', async () => {
    seedReviews();
    session.setResult({ status: 'completed', answer: JSON.stringify(validAiResult) });

    const result = await generateAiInsightsViaSession(input());

    expect(session.runCalls).toHaveLength(1);
    expect(result.developers[0].developerName).toBe('alice');
    expect(result.team.summary).toBe('A well-balanced team.');
  });

  it('answer read from transcript: parses the completed session answer into insights', async () => {
    seedReviews();
    session.setResult({ status: 'completed', answer: JSON.stringify(validAiResult) });

    const result = await generateAiInsightsViaSession(input());

    expect(result.generatedAt).toBeDefined();
  });

  it('no stats: rejects with the French no-stats message', async () => {
    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      'Aucune statistique de review disponible pour ce projet',
    );
  });

  it('not logged in: rejects with the French subscription-required message', async () => {
    seedReviews();
    session.setResult({ status: 'unavailable', reason: 'dispatch-failed' });

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      "Impossible de générer les insights — connexion à l'abonnement Claude requise",
    );
  });

  it('api key present: refuses before dispatch with the subscription-only message', async () => {
    seedReviews();
    environment.setHasAnthropicApiKey(true);

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      "Impossible de générer les insights — l'abonnement Claude est requis, pas de clé API",
    );
    expect(session.runCalls).toHaveLength(0);
  });

  it('timeout: rejects with the French timeout message', async () => {
    seedReviews();
    session.setResult({ status: 'timed-out' });

    await expect(generateAiInsightsViaSession(input())).rejects.toThrow(
      'La génération des insights a expiré',
    );
  });

  it('no remaining -p: no production insights code invokes claude -p / --print', () => {
    const insightsDir = join(process.cwd(), 'src', 'modules', 'statistics-insights');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || full.includes('/tests/')) {
          continue;
        }
        const content = readFileSync(full, 'utf-8');
        if (/['"]--print['"]/.test(content) || /['"]-p['"]/.test(content)) {
          offenders.push(full);
        }
      }
    };
    walk(insightsDir);

    expect(offenders).toEqual([]);
    expect(
      existsSync(join(process.cwd(), 'src', 'frameworks', 'claude', 'claudeInsightsInvoker.ts')),
    ).toBe(false);
  });
});
