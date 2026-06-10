import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildFormModel, buildInputPayload } from '@/dashboard/modules/setupWizardForms.js';
import { serializeSetupInput } from '@/modules/setup-wizard/entities/setupInput/setupInput.schema.js';
import type {
  SetupStateGateway,
  SetupStateLoadResult,
} from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import { setupWizardRoutes } from '@/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.js';
import { SetupRunRegistry } from '@/modules/setup-wizard/usecases/streamSetupRun.usecase.js';
import { WizardStreamEventFactory } from '@/tests/factories/wizardStreamEvent.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubSetupProcessGateway } from '@/tests/stubs/setupProcess.stub.js';

class NullSetupStateGateway implements SetupStateGateway {
  load(): SetupStateLoadResult {
    return { state: null, corrupted: false };
  }
  save(): void {}
  reset(): void {}
}

async function startRun(application: FastifyInstance): Promise<string> {
  const response = await application.inject({ method: 'POST', url: '/api/setup/start' });
  return JSON.parse(response.body).runId;
}

describe('Setup Wizard interactive forms (acceptance, Iteration B1)', () => {
  let application: FastifyInstance;
  let processGateway: StubSetupProcessGateway;
  let registry: SetupRunRegistry;

  beforeEach(async () => {
    processGateway = new StubSetupProcessGateway();
    registry = new SetupRunRegistry(processGateway);

    application = Fastify();
    await application.register(setupWizardRoutes, {
      registry,
      setupStateGateway: new NullSetupStateGateway(),
      logger: createStubLogger(),
    });
    await application.ready();
  });

  afterEach(async () => {
    await application.close();
  });

  describe('user inputs collected in the dashboard are sent back to the CLI subprocess via stdin', () => {
    it('text: writes the raw string the gateway parses as a text answer', async () => {
      const runId = await startRun(application);
      processGateway.emitLine(
        WizardStreamEventFactory.awaitingInput({ step: 'add-project', kind: 'text' }),
      );

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId, kind: 'text', value: '/home/u/api' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('written');
      expect(processGateway.lastWrittenLine).toBe('/home/u/api');
    });

    it('confirm: writes a JSON boolean the gateway parses as a confirm answer', async () => {
      const runId = await startRun(application);
      processGateway.emitLine(
        WizardStreamEventFactory.awaitingInput({ step: 'secrets', kind: 'confirm' }),
      );

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId, kind: 'confirm', value: true },
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('true');
    });

    it('choice: writes a JSON string the gateway parses as a choice answer', async () => {
      const runId = await startRun(application);
      processGateway.emitLine(
        WizardStreamEventFactory.awaitingInput({
          step: 'pipeline',
          kind: 'choice',
          options: [
            { label: 'Backend', value: 'backend' },
            { label: 'Frontend', value: 'frontend' },
          ],
        }),
      );

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId, kind: 'choice', value: 'backend' },
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('"backend"');
    });

    it('multiSelect: writes a JSON array the gateway parses as a multi-select answer', async () => {
      const runId = await startRun(application);
      processGateway.emitLine(
        WizardStreamEventFactory.awaitingInput({
          step: 'pipeline',
          kind: 'multiSelect',
          options: [
            { label: 'SOLID', value: 'solid' },
            { label: 'Testing', value: 'testing' },
          ],
        }),
      );

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId, kind: 'multiSelect', value: ['solid', 'testing'] },
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('["solid","testing"]');
    });
  });

  describe('the written line matches the contract the SPEC-187 gateway parses', () => {
    it('shares one serializer between the controller and the form payload', () => {
      expect(serializeSetupInput({ kind: 'text', value: '/home/u/api' })).toBe('/home/u/api');
      expect(serializeSetupInput({ kind: 'confirm', value: false })).toBe('false');
      expect(serializeSetupInput({ kind: 'choice', value: 'backend' })).toBe('"backend"');
      expect(serializeSetupInput({ kind: 'multiSelect', value: ['solid', 'testing'] })).toBe(
        '["solid","testing"]',
      );
    });
  });

  describe('input for a run that is not active is rejected', () => {
    it('returns 409 no-active-run when the runId does not match the active run', async () => {
      await startRun(application);

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId: 'unknown-run', kind: 'text', value: '/home/u/api' },
      });

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body).error).toBe('no-active-run');
    });
  });

  describe('an invalid input body is rejected at the boundary', () => {
    it('returns 400 when the value does not match the declared kind', async () => {
      const runId = await startRun(application);

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId, kind: 'confirm', value: 'not-a-boolean' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('the run advances after the answer is written to stdin', () => {
    it('forwards a following completion event to a subscriber once input is submitted', async () => {
      const runId = await startRun(application);
      const received: string[] = [];
      registry.subscribe(runId, {
        onEvent: (line) => received.push(line),
        onClose: () => {},
      });

      processGateway.emitLine(
        WizardStreamEventFactory.awaitingInput({ step: 'add-project', kind: 'text' }),
      );
      await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: { runId, kind: 'text', value: '/home/u/api' },
      });
      processGateway.emitLine(
        WizardStreamEventFactory.stepCompleted({ step: 'add-project', status: 'succeeded' }),
      );

      expect(processGateway.lastWrittenLine).toBe('/home/u/api');
      const advanced = received.some((line) => line.includes('"status":"succeeded"'));
      expect(advanced).toBe(true);
    });
  });

  describe('the dashboard form model produces a body the input endpoint accepts (Iteration B2)', () => {
    function parseAwaitingInput(line: string): Record<string, unknown> {
      return JSON.parse(line);
    }

    it('text: form model + payload write the raw string to stdin', async () => {
      const runId = await startRun(application);
      const eventLine = WizardStreamEventFactory.awaitingInput({
        step: 'add-project',
        kind: 'text',
        defaultValue: '/home/u/cwd',
      });
      processGateway.emitLine(eventLine);

      const model = buildFormModel(parseAwaitingInput(eventLine));
      if (model === null) {
        throw new Error('expected a form model');
      }
      expect(model.kind).toBe('text');
      const result = buildInputPayload(model.kind, runId, '/home/u/api', model.options);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: result.body,
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('/home/u/api');
    });

    it('confirm: form model + payload write a JSON boolean to stdin', async () => {
      const runId = await startRun(application);
      const eventLine = WizardStreamEventFactory.awaitingInput({
        step: 'secrets',
        kind: 'confirm',
      });
      processGateway.emitLine(eventLine);

      const model = buildFormModel(parseAwaitingInput(eventLine));
      if (model === null) {
        throw new Error('expected a form model');
      }
      const result = buildInputPayload(model.kind, runId, true, model.options);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: result.body,
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('true');
    });

    it('choice: form model + payload write a JSON string to stdin', async () => {
      const runId = await startRun(application);
      const eventLine = WizardStreamEventFactory.awaitingInput({
        step: 'pipeline',
        kind: 'choice',
        options: [
          { label: 'Backend', value: 'backend' },
          { label: 'Frontend', value: 'frontend' },
        ],
      });
      processGateway.emitLine(eventLine);

      const model = buildFormModel(parseAwaitingInput(eventLine));
      if (model === null) {
        throw new Error('expected a form model');
      }
      const result = buildInputPayload(model.kind, runId, 'backend', model.options);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: result.body,
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('"backend"');
    });

    it('multiSelect: form model + payload write a JSON array to stdin', async () => {
      const runId = await startRun(application);
      const eventLine = WizardStreamEventFactory.awaitingInput({
        step: 'pipeline',
        kind: 'multiSelect',
        options: [
          { label: 'SOLID', value: 'solid' },
          { label: 'Testing', value: 'testing' },
        ],
      });
      processGateway.emitLine(eventLine);

      const model = buildFormModel(parseAwaitingInput(eventLine));
      if (model === null) {
        throw new Error('expected a form model');
      }
      const result = buildInputPayload(model.kind, runId, ['solid', 'testing'], model.options);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const response = await application.inject({
        method: 'POST',
        url: '/api/setup/input',
        payload: result.body,
      });

      expect(response.statusCode).toBe(200);
      expect(processGateway.lastWrittenLine).toBe('["solid","testing"]');
    });

    it('rejects a choice value not among the offered options before posting', () => {
      const eventLine = WizardStreamEventFactory.awaitingInput({
        step: 'pipeline',
        kind: 'choice',
        options: [{ label: 'Backend', value: 'backend' }],
      });
      const model = buildFormModel(parseAwaitingInput(eventLine));
      if (model === null) {
        throw new Error('expected a form model');
      }

      const result = buildInputPayload(model.kind, 'run-1', 'database', model.options);

      expect(result.ok).toBe(false);
    });
  });
});
