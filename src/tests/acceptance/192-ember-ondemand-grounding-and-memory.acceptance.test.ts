import { describe, it, expect } from 'vitest';

import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import { clearEmberMemory } from '@/modules/ember-chat/usecases/clearEmberMemory/clearEmberMemory.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubEmberAnswerTransportGateway } from '@/tests/stubs/emberAnswerTransport.stub.js';
import { StubEmberMemoryGateway, StubEmberMemoryStore } from '@/tests/stubs/emberMemory.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';

const PROJECT_PATH = '/projects/alpha';
const OTHER_PROJECT_PATH = '/projects/beta';

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

describe('Ground Ember on demand and remember per project (acceptance, SPEC-192)', () => {
  describe('Ember can reach any review data on demand, not only the most recent items', () => {
    it('old specific review on demand: MR-1 lies far outside the recent window yet is reachable', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Pourquoi MR-1 a-t-elle été bloquée il y a longtemps ?' },
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
      expect(answer.toLowerCase()).toContain('à la demande');
    });
  });

  describe('a question is never refused merely because the data falls outside a recent window', () => {
    it('no recent-window refusal: the framing carries no window-ceiling refusal text', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Liste toutes les reviews du début du projet.' },
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

      const { answer } = await collectStream(result.subscribe);

      expect(answer).not.toContain('résumé agrégé seulement');
      expect(answer).not.toContain('aucun autre accès');
      expect(answer).not.toContain('ni système de fichiers');
    });
  });

  describe('read-only and subscription-only guarantees are preserved (Phase B regressions)', () => {
    it('read-only preserved: the answer framing still states it performs no writes', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Crée un quality gate à 80 pour le projet.' },
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

      const { answer } = await collectStream(result.subscribe);

      expect(answer.toLowerCase()).toContain('lecture seule');
    });

    it('api key present: refuses to answer when an Anthropic API key is set', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Statut ?' },
        {
          transport,
          environment: environment(true),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('billing-regression-prevented');
      expect(transport.startCount).toBe(0);
    });
  });

  describe('Ember keeps a per-project conversation memory that survives a restart', () => {
    it('follow-up across restart: a later instance recalls the earlier turn without repeating the subject', async () => {
      const store = new StubEmberMemoryStore();

      const firstTransport = new StubEmberAnswerTransportGateway();
      firstTransport.respondWith(async () => 'Le projet alpha régresse chaque vendredi.');
      const firstSession = await askEmber(
        { question: 'Quel est le constat récurrent du projet alpha ?' },
        {
          transport: firstTransport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(store),
          projectPath: PROJECT_PATH,
        },
      );
      expect(firstSession.status).toBe('streaming');
      if (firstSession.status !== 'streaming') {
        return;
      }
      await collectStream(firstSession.subscribe);

      const restartedTransport = new StubEmberAnswerTransportGateway();
      restartedTransport.answerFromSystemPrompt();
      const followUp = await askEmber(
        { question: 'Et le mois dernier ?' },
        {
          transport: restartedTransport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(store),
          projectPath: PROJECT_PATH,
        },
      );
      expect(followUp.status).toBe('streaming');
      if (followUp.status !== 'streaming') {
        return;
      }

      const { answer, statuses } = await collectStream(followUp.subscribe);

      expect(statuses.at(-1)).toBe('idle');
      expect(answer).toContain('Le projet alpha régresse chaque vendredi.');
    });

    it("per-project isolation: project A's memory never reaches project B's answer", async () => {
      const store = new StubEmberMemoryStore();

      const seedTransport = new StubEmberAnswerTransportGateway();
      seedTransport.respondWith(async () => 'Constat confidentiel sur le projet alpha.');
      const seedSession = await askEmber(
        { question: 'Quel est le constat du projet alpha ?' },
        {
          transport: seedTransport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(store),
          projectPath: PROJECT_PATH,
        },
      );
      expect(seedSession.status).toBe('streaming');
      if (seedSession.status !== 'streaming') {
        return;
      }
      await collectStream(seedSession.subscribe);

      const otherTransport = new StubEmberAnswerTransportGateway();
      otherTransport.answerFromSystemPrompt();
      const otherReadData = new StubEmberReadDataGateway();
      otherReadData.setReviewScores(
        OTHER_PROJECT_PATH,
        ProjectStatsFactory.withReviews([ReviewStatsFactory.create({ mrNumber: 1 })]),
      );
      const otherSession = await askEmber(
        { question: 'Quoi de neuf sur le projet beta ?' },
        {
          transport: otherTransport,
          environment: environment(false),
          readData: otherReadData,
          memory: new StubEmberMemoryGateway(store),
          projectPath: OTHER_PROJECT_PATH,
        },
      );
      expect(otherSession.status).toBe('streaming');
      if (otherSession.status !== 'streaming') {
        return;
      }

      const { answer } = await collectStream(otherSession.subscribe);

      expect(answer).not.toContain('Constat confidentiel sur le projet alpha.');
    });

    it('corrupted memory: an answer is still produced when the memory is unreadable', async () => {
      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();
      const memory = new StubEmberMemoryGateway();
      memory.markCorrupted();

      const result = await askEmber(
        { question: 'Statut ?' },
        {
          transport,
          environment: environment(false),
          readData: largeReviewData(),
          memory,
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('streaming');
      if (result.status !== 'streaming') {
        return;
      }

      const { statuses } = await collectStream(result.subscribe);

      expect(statuses.at(-1)).toBe('idle');
    });
  });

  describe('Ember reuses recorded recurring insights and the operator can clear the memory', () => {
    it('reused insight: a recorded recurring finding is surfaced for reuse without recomputation', async () => {
      const store = new StubEmberMemoryStore();
      const recorder = new StubEmberMemoryGateway(store);
      await recorder.appendInsight(PROJECT_PATH, 'Le projet X régresse chaque vendredi.');

      const transport = new StubEmberAnswerTransportGateway();
      transport.answerFromSystemPrompt();
      const result = await askEmber(
        { question: 'Quoi de neuf sur X ?' },
        {
          transport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(store),
          projectPath: PROJECT_PATH,
        },
      );

      expect(result.status).toBe('streaming');
      if (result.status !== 'streaming') {
        return;
      }

      const { answer } = await collectStream(result.subscribe);

      expect(answer.toLowerCase()).toContain('constats récurrents');
      expect(answer).toContain('Le projet X régresse chaque vendredi.');
    });

    it('clear memory: after clearing, the next question starts with no prior context', async () => {
      const store = new StubEmberMemoryStore();

      const seedTransport = new StubEmberAnswerTransportGateway();
      seedTransport.respondWith(async () => 'Constat antérieur sur le projet alpha.');
      const seedSession = await askEmber(
        { question: 'Quel est le constat du projet alpha ?' },
        {
          transport: seedTransport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(store),
          projectPath: PROJECT_PATH,
        },
      );
      expect(seedSession.status).toBe('streaming');
      if (seedSession.status !== 'streaming') {
        return;
      }
      await collectStream(seedSession.subscribe);

      await clearEmberMemory({
        memory: new StubEmberMemoryGateway(store),
        projectPath: PROJECT_PATH,
      });

      const nextTransport = new StubEmberAnswerTransportGateway();
      nextTransport.answerFromSystemPrompt();
      const nextSession = await askEmber(
        { question: 'Et maintenant ?' },
        {
          transport: nextTransport,
          environment: environment(false),
          readData: largeReviewData(),
          memory: new StubEmberMemoryGateway(store),
          projectPath: PROJECT_PATH,
        },
      );
      expect(nextSession.status).toBe('streaming');
      if (nextSession.status !== 'streaming') {
        return;
      }

      const { answer } = await collectStream(nextSession.subscribe);

      expect(answer).not.toContain('Constat antérieur sur le projet alpha.');
      expect(answer.toLowerCase()).not.toContain('conversation précédente');
    });
  });
});
