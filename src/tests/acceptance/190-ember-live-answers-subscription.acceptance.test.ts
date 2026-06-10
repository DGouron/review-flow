import { describe, it, expect } from 'vitest';

import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';
import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubEmberAnswerTransportGateway } from '@/tests/stubs/emberAnswerTransport.stub.js';
import { StubEmberMemoryGateway } from '@/tests/stubs/emberMemory.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';

const PROJECT_PATH = '/projects/alpha';

function reviewData(): StubEmberReadDataGateway {
  const project = ProjectStatsFactory.withReviews([
    ReviewStatsFactory.create({ mrNumber: 42, score: 3, blocking: 4, warnings: 1 }),
    ReviewStatsFactory.create({ mrNumber: 43, score: 4, blocking: 2, warnings: 0 }),
  ]);
  const readData = new StubEmberReadDataGateway();
  readData.setReviewScores(PROJECT_PATH, project);
  return readData;
}

function largeReviewData(): StubEmberReadDataGateway {
  const reviews = Array.from({ length: 500 }, (_, index) =>
    ReviewStatsFactory.create({ mrNumber: index, score: index % 10, blocking: index % 3 }),
  );
  const readData = new StubEmberReadDataGateway();
  readData.setReviewScores(PROJECT_PATH, ProjectStatsFactory.withReviews(reviews));
  return readData;
}

function environment(hasApiKey: boolean): StubEnvironmentGateway {
  const stub = new StubEnvironmentGateway();
  stub.setHasAnthropicApiKey(hasApiKey);
  return stub;
}

function collectStream(subscribe: (subscriber: EmberStreamSubscriber) => void): Promise<{
  answer: string;
  statuses: string[];
}> {
  return new Promise((resolve) => {
    let answer = '';
    const statuses: string[] = [];
    subscribe({
      onStatus: (state) => {
        statuses.push(state);
      },
      onChunk: (text) => {
        answer += text;
      },
      onDone: () => resolve({ answer, statuses }),
      onError: () => resolve({ answer, statuses }),
    });
  });
}

describe('Answer Ember questions live via the Claude subscription (acceptance, SPEC-190)', () => {
  describe('each answer is grounded on the current project review data and streams progressively', () => {
    it('nominal: streams a grounded answer ending with an idle status', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Quelles reviews sont en cours ?' },
        {
          transport,
          environment: environment(false),
          readData: reviewData(),
          memory: new StubEmberMemoryGateway(),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('streaming');
      if (result.status !== 'streaming') {
        return;
      }

      const { answer, statuses } = await collectStream(result.subscribe);

      expect(answer).toContain('42');
      expect(statuses[0]).toBe('working');
      expect(statuses.at(-1)).toBe('idle');
      expect(transport.startCount).toBe(1);
    });
  });

  describe('grounding must succeed regardless of project size', () => {
    it('large grounding: bounds the prompt and never fails on a huge history', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Résume mon historique' },
        {
          transport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('streaming');
      if (result.status !== 'streaming') {
        return;
      }

      const { answer, statuses } = await collectStream(result.subscribe);

      expect(statuses.at(-1)).toBe('idle');
      expect(answer.length).toBeLessThan(60_000);
    });
  });

  describe('the subscription is the only allowed billing path', () => {
    it('api key present: refuses to answer when an Anthropic API key is set', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Statut ?' },
        {
          transport,
          environment: environment(true),
          readData: reviewData(),
          memory: new StubEmberMemoryGateway(),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('billing-regression-prevented');
      expect(transport.startCount).toBe(0);
    });
  });

  describe('when the subscription is unavailable, Ember reports unavailability', () => {
    it('not logged in: returns unavailable when the dispatch cannot start', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.failStart();

      const result = await askEmber(
        { question: 'Statut ?' },
        {
          transport,
          environment: environment(false),
          readData: reviewData(),
          memory: new StubEmberMemoryGateway(),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('unavailable');
    });
  });

  describe('when answering fails part-way through, the user can retry', () => {
    it('mid-stream failure: surfaces an error after partial chunks', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.failMidStream();

      const result = await askEmber(
        { question: 'Statut ?' },
        {
          transport,
          environment: environment(false),
          readData: reviewData(),
          memory: new StubEmberMemoryGateway(),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('streaming');
      if (result.status !== 'streaming') {
        return;
      }

      const statuses: string[] = [];
      let errored = false;
      await new Promise<void>((resolve) => {
        result.subscribe({
          onStatus: (state) => statuses.push(state),
          onChunk: () => undefined,
          onDone: () => resolve(),
          onError: () => {
            errored = true;
            resolve();
          },
        });
      });

      expect(errored).toBe(true);
      expect(statuses).toContain('error');
    });
  });

  describe('grounding is bounded by buildEmberSystemPrompt as a pure function', () => {
    it('keeps aggregates and recent reviews while capping a huge history', () => {
      const reviews = Array.from({ length: 500 }, (_, index) =>
        ReviewStatsFactory.create({ mrNumber: index, score: index % 10 }),
      );
      const prompt = buildEmberSystemPrompt({
        reviewScores: ProjectStatsFactory.withReviews(reviews),
        insights: null,
        jobHistory: null,
        worktrees: [],
        memory: null,
      });

      expect(prompt.length).toBeLessThan(60_000);
      expect(prompt).toContain('totalReviews');
    });
  });
});
