import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'node:http';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { setupWizardRoutes } from '@/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.js';
import { SetupRunRegistry } from '@/modules/setup-wizard/usecases/streamSetupRun.usecase.js';
import { StubSetupProcessGateway } from '@/tests/stubs/setupProcess.stub.js';
import { WizardStreamEventFactory } from '@/tests/factories/wizardStreamEvent.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import type { SetupStateGateway, SetupStateLoadResult } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';

class StubSetupStateGateway implements SetupStateGateway {
  private result: SetupStateLoadResult = { state: null, corrupted: false };

  setState(state: SetupState | null): void {
    this.result = { state, corrupted: false };
  }

  load(): SetupStateLoadResult {
    return this.result;
  }

  save(): void {}

  reset(): void {}
}

describe('setupWizard routes', () => {
  let application: FastifyInstance;
  let processGateway: StubSetupProcessGateway;
  let stateGateway: StubSetupStateGateway;
  let registry: SetupRunRegistry;

  beforeEach(async () => {
    processGateway = new StubSetupProcessGateway();
    stateGateway = new StubSetupStateGateway();
    registry = new SetupRunRegistry(processGateway);

    application = Fastify();
    await application.register(setupWizardRoutes, {
      registry,
      setupStateGateway: stateGateway,
      logger: createStubLogger(),
    });
    await application.ready();
  });

  afterEach(async () => {
    await application.close();
  });

  it('starts a run and returns a run id', async () => {
    const response = await application.inject({ method: 'POST', url: '/api/setup/start' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.runId).toMatch(/.+/);
    expect(processGateway.spawnCount).toBe(1);
  });

  it('rejects a second start with 409 while a run is active', async () => {
    await application.inject({ method: 'POST', url: '/api/setup/start' });

    const response = await application.inject({ method: 'POST', url: '/api/setup/start' });

    expect(response.statusCode).toBe(409);
    expect(processGateway.spawnCount).toBe(1);
  });

  it('returns null state when no setup-state.json exists', async () => {
    const response = await application.inject({ method: 'GET', url: '/api/setup/state' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.state).toBeNull();
  });

  it('returns the persisted setup state for polling fallback', async () => {
    stateGateway.setState({
      version: 1,
      startedAt: '2026-05-28T10:00:00Z',
      updatedAt: '2026-05-28T10:05:00Z',
      steps: { dependencies: { status: 'succeeded' } },
    });

    const response = await application.inject({ method: 'GET', url: '/api/setup/state' });

    const body = JSON.parse(response.body);
    expect(body.state.steps.dependencies.status).toBe('succeeded');
  });

  it('streams validated wizard events as SSE data frames then closes on exit', async () => {
    const address = await application.listen({ port: 0, host: '127.0.0.1' });
    const start = await application.inject({ method: 'POST', url: '/api/setup/start' });
    const runId = JSON.parse(start.body).runId;

    const streamResult = await new Promise<{ contentType: string; body: string }>(
      (resolve, reject) => {
        const request = get(`${address}/api/setup/events?runId=${runId}`, (response) => {
          const contentType = String(response.headers['content-type']);
          let body = '';
          response.setEncoding('utf-8');
          response.on('data', (chunk: string) => {
            body += chunk;
          });
          response.on('end', () => resolve({ contentType, body }));
        });
        request.on('error', reject);

        processGateway.emitLine(WizardStreamEventFactory.stepStarted({ step: 'dependencies' }));
        processGateway.emitLine('this is not valid json');
        processGateway.emitLine(
          WizardStreamEventFactory.stepCompleted({ step: 'dependencies', status: 'succeeded' }),
        );
        processGateway.exit(0);
      },
    );

    expect(streamResult.contentType).toContain('text/event-stream');
    expect(streamResult.body).toContain('data: {"step":"dependencies","status":"in_progress"');
    expect(streamResult.body).toContain('data: {"step":"dependencies","status":"succeeded"');
    expect(streamResult.body).not.toContain('this is not valid json');
    expect(streamResult.body).toContain('event: end');
  });

  it('writes a choice answer to stdin as a JSON string and returns 200', async () => {
    const start = await application.inject({ method: 'POST', url: '/api/setup/start' });
    const runId = JSON.parse(start.body).runId;

    const response = await application.inject({
      method: 'POST',
      url: '/api/setup/input',
      payload: { runId, kind: 'choice', value: 'github' },
    });

    expect(response.statusCode).toBe(200);
    expect(processGateway.lastWrittenLine).toBe('"github"');
  });

  it('writes a text answer as the raw line, not JSON-quoted', async () => {
    const start = await application.inject({ method: 'POST', url: '/api/setup/start' });
    const runId = JSON.parse(start.body).runId;

    await application.inject({
      method: 'POST',
      url: '/api/setup/input',
      payload: { runId, kind: 'text', value: '/home/u/api' },
    });

    expect(processGateway.lastWrittenLine).toBe('/home/u/api');
  });

  it('writes a multiSelect answer as a JSON array', async () => {
    const start = await application.inject({ method: 'POST', url: '/api/setup/start' });
    const runId = JSON.parse(start.body).runId;

    await application.inject({
      method: 'POST',
      url: '/api/setup/input',
      payload: { runId, kind: 'multiSelect', value: ['solid', 'testing'] },
    });

    expect(processGateway.lastWrittenLine).toBe('["solid","testing"]');
  });

  it('writes a confirm answer as a JSON boolean', async () => {
    const start = await application.inject({ method: 'POST', url: '/api/setup/start' });
    const runId = JSON.parse(start.body).runId;

    await application.inject({
      method: 'POST',
      url: '/api/setup/input',
      payload: { runId, kind: 'confirm', value: true },
    });

    expect(processGateway.lastWrittenLine).toBe('true');
  });

  it('returns 409 when there is no active run to answer', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/setup/input',
      payload: { runId: 'RV-unknown', kind: 'text', value: 'x' },
    });

    expect(response.statusCode).toBe(409);
    expect(processGateway.lastWrittenLine).toBeNull();
  });

  it('rejects an input body whose value does not match its kind with 400', async () => {
    const start = await application.inject({ method: 'POST', url: '/api/setup/start' });
    const runId = JSON.parse(start.body).runId;

    const response = await application.inject({
      method: 'POST',
      url: '/api/setup/input',
      payload: { runId, kind: 'confirm', value: 'not-a-boolean' },
    });

    expect(response.statusCode).toBe(400);
    expect(processGateway.lastWrittenLine).toBeNull();
  });

  it('cancels the active run and returns 200', async () => {
    await application.inject({ method: 'POST', url: '/api/setup/start' });

    const response = await application.inject({ method: 'POST', url: '/api/setup/cancel' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('cancelled');
    expect(processGateway.killed).toBe(true);
    expect(registry.hasActiveRun()).toBe(false);
  });

  it('returns 409 when cancelling with no active run', async () => {
    const response = await application.inject({ method: 'POST', url: '/api/setup/cancel' });

    expect(response.statusCode).toBe(409);
  });
});
