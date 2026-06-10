import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { emberChatRoutes } from '@/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.js';
import { EmberMemoryTurnFactory } from '@/tests/factories/emberMemory.factory.js';
import { StubEmberAnswerTransportGateway } from '@/tests/stubs/emberAnswerTransport.stub.js';
import { StubEmberMemoryGateway } from '@/tests/stubs/emberMemory.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

const PROJECT_PATH = '/projects/alpha';

function parseSseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

describe('emberChat routes', () => {
  let application: FastifyInstance;
  let transport: StubEmberAnswerTransportGateway;
  let environment: StubEnvironmentGateway;
  let memory: StubEmberMemoryGateway;

  function buildApplication(): FastifyInstance {
    transport = new StubEmberAnswerTransportGateway();
    transport.respondWith(async (question) => `Réponse à ${question}`);
    environment = new StubEnvironmentGateway();
    environment.setHasAnthropicApiKey(false);
    memory = new StubEmberMemoryGateway();

    const instance = Fastify();
    void instance.register(emberChatRoutes, {
      transport,
      environment,
      readData: new StubEmberReadDataGateway(),
      memory,
      projectPath: PROJECT_PATH,
      logger: createStubLogger(),
    });
    return instance;
  }

  beforeEach(async () => {
    application = buildApplication();
    await application.ready();
  });

  afterEach(async () => {
    await application.close();
  });

  it('rejects an empty question with 400 and never starts', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(transport.startCount).toBe(0);
  });

  it('streams chunk, status and end events for a valid question', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSseEvents(response.body);
    const statuses = events.filter((event) => event.type === 'status').map((event) => event.state);
    const chunks = events.filter((event) => event.type === 'chunk').map((event) => event.text);

    expect(statuses[0]).toBe('working');
    expect(statuses.at(-1)).toBe('idle');
    expect(chunks.join('')).toContain('Réponse');
  });

  it('emits an error event when the assistant is unreachable', async () => {
    application = buildApplication();
    transport.failStart();
    await application.ready();

    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    const events = parseSseEvents(response.body);
    const errors = events.filter((event) => event.type === 'error');

    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0].message)).toContain('INDISPONIBLE');
  });

  it('emits an error event when answering fails mid-stream', async () => {
    application = buildApplication();
    transport.failMidStream();
    await application.ready();

    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    const events = parseSseEvents(response.body);
    const errors = events.filter((event) => event.type === 'error');

    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0].message)).toContain('INDISPONIBLE');
  });

  it('does not stream when an Anthropic API key is present', async () => {
    application = buildApplication();
    environment.setHasAnthropicApiKey(true);
    await application.ready();

    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    const events = parseSseEvents(response.body);
    const errors = events.filter((event) => event.type === 'error');

    expect(errors.length).toBeGreaterThan(0);
    expect(transport.startCount).toBe(0);
  });

  it('clears the project memory on POST /api/ember/memory/clear', async () => {
    await memory.appendTurn(PROJECT_PATH, EmberMemoryTurnFactory.create());

    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/memory/clear',
    });

    expect(response.statusCode).toBe(200);
    expect(await memory.load(PROJECT_PATH)).toBeNull();
  });
});
