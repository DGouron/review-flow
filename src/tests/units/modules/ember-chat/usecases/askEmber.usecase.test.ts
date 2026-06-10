import { describe, it, expect } from 'vitest';

import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import { EmberMemoryTurnFactory } from '@/tests/factories/emberMemory.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubEmberAnswerTransportGateway } from '@/tests/stubs/emberAnswerTransport.stub.js';
import { StubEmberMemoryGateway } from '@/tests/stubs/emberMemory.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';

const PROJECT_PATH = '/projects/alpha';
const FIXED_NOW = (): Date => new Date('2026-05-28T10:00:00Z');

interface DepsOptions {
  hasApiKey: boolean;
  failStart?: boolean;
  failMidStream?: boolean;
}

function buildDeps(options: DepsOptions): {
  transport: StubEmberAnswerTransportGateway;
  environment: StubEnvironmentGateway;
  readData: StubEmberReadDataGateway;
  memory: StubEmberMemoryGateway;
  projectPath: string;
  now: () => Date;
} {
  const transport = new StubEmberAnswerTransportGateway();
  transport.answerFromSystemPrompt();
  if (options.failStart === true) {
    transport.failStart();
  }
  if (options.failMidStream === true) {
    transport.failMidStream();
  }
  const environment = new StubEnvironmentGateway();
  environment.setHasAnthropicApiKey(options.hasApiKey);
  const readData = new StubEmberReadDataGateway();
  readData.setReviewScores(
    PROJECT_PATH,
    ProjectStatsFactory.withReviews([ReviewStatsFactory.create({ mrNumber: 42 })]),
  );
  const memory = new StubEmberMemoryGateway();
  return { transport, environment, readData, memory, projectPath: PROJECT_PATH, now: FIXED_NOW };
}

function collectStream(subscribe: (subscriber: EmberStreamSubscriber) => void): Promise<{
  answer: string;
  statuses: string[];
  errored: boolean;
}> {
  return new Promise((resolve) => {
    let answer = '';
    let errored = false;
    const statuses: string[] = [];
    subscribe({
      onStatus: (state) => statuses.push(state),
      onChunk: (text) => {
        answer += text;
      },
      onDone: () => resolve({ answer, statuses, errored }),
      onError: () => {
        errored = true;
        resolve({ answer, statuses, errored });
      },
    });
  });
}

describe('askEmber', () => {
  it('streams a grounded answer with a working then idle status sequence', async () => {
    const deps = buildDeps({ hasApiKey: false });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { answer, statuses } = await collectStream(result.subscribe);
    expect(answer).toContain('42');
    expect(statuses[0]).toBe('working');
    expect(statuses.at(-1)).toBe('idle');
    expect(deps.transport.startCount).toBe(1);
  });

  it('prevents the billing regression when an Anthropic API key is present', async () => {
    const deps = buildDeps({ hasApiKey: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('billing-regression-prevented');
    expect(deps.transport.startCount).toBe(0);
  });

  it('returns unavailable when the transport cannot start', async () => {
    const deps = buildDeps({ hasApiKey: false, failStart: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('unavailable');
  });

  it('still streams an answer for a question about data outside the recent window', async () => {
    const deps = buildDeps({ hasApiKey: false });
    const reviews = Array.from({ length: 500 }, (_, index) =>
      ReviewStatsFactory.create({ mrNumber: index, score: index % 10 }),
    );
    deps.readData.setReviewScores(PROJECT_PATH, ProjectStatsFactory.withReviews(reviews));

    const result = await askEmber(
      { question: 'Pourquoi MR-1 a-t-elle été bloquée il y a longtemps ?' },
      deps,
    );

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { answer, statuses } = await collectStream(result.subscribe);
    expect(statuses.at(-1)).toBe('idle');
    expect(answer.toLowerCase()).toContain('à la demande');
    expect(answer).not.toContain('résumé agrégé seulement');
  });

  it('surfaces an error status when answering fails mid-stream', async () => {
    const deps = buildDeps({ hasApiKey: false, failMidStream: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { statuses, errored } = await collectStream(result.subscribe);
    expect(errored).toBe(true);
    expect(statuses).toContain('error');
  });

  it('injects a prior conversation turn into the prompt so a follow-up keeps context', async () => {
    const deps = buildDeps({ hasApiKey: false });
    await deps.memory.appendTurn(
      PROJECT_PATH,
      EmberMemoryTurnFactory.create({
        question: 'Quel est le statut du projet X ?',
        answer: 'Le projet X régresse chaque vendredi.',
      }),
    );

    const result = await askEmber({ question: 'Et le mois dernier ?' }, deps);

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { answer } = await collectStream(result.subscribe);
    expect(answer).toContain('Le projet X régresse chaque vendredi.');
  });

  it('appends the new question and answer to memory after the answer completes', async () => {
    const deps = buildDeps({ hasApiKey: false });

    const result = await askEmber({ question: 'Quel est le pire score ?' }, deps);
    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    await collectStream(result.subscribe);

    const loaded = await deps.memory.load(PROJECT_PATH);
    expect(loaded?.turns).toHaveLength(1);
    expect(loaded?.turns[0]?.question).toBe('Quel est le pire score ?');
    expect(loaded?.turns[0]?.answer.length).toBeGreaterThan(0);
  });

  it('still streams an answer when the memory is corrupted', async () => {
    const deps = buildDeps({ hasApiKey: false });
    deps.memory.markCorrupted();

    const result = await askEmber({ question: 'Statut ?' }, deps);

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { statuses } = await collectStream(result.subscribe);
    expect(statuses.at(-1)).toBe('idle');
  });
});
