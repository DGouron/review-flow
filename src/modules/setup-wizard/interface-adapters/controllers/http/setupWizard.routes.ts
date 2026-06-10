import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';

import { setupInputGuard } from '@/modules/setup-wizard/entities/setupInput/setupInput.guard.js';
import { serializeSetupInput } from '@/modules/setup-wizard/entities/setupInput/setupInput.schema.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import { wizardStreamEventGuard } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.js';
import type { SetupRunRegistry } from '@/modules/setup-wizard/usecases/streamSetupRun.usecase.js';

export interface SetupWizardRoutesOptions {
  registry: SetupRunRegistry;
  setupStateGateway: SetupStateGateway;
  logger: Logger;
}

const startPayloadSchema = z.object({
  projectPath: z.string().min(1).nullable().optional(),
});

const eventsQuerySchema = z.object({
  runId: z.string().min(1),
});

function parseLine(line: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const result = wizardStreamEventGuard.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  return JSON.stringify(result.data);
}

export const setupWizardRoutes: FastifyPluginAsync<SetupWizardRoutesOptions> = async (
  fastify,
  options,
) => {
  const { registry, setupStateGateway, logger } = options;

  fastify.post('/api/setup/start', async (request, reply) => {
    const parsed = startPayloadSchema.safeParse(request.body ?? {});
    const projectPath = parsed.success ? (parsed.data.projectPath ?? null) : null;

    const result = registry.start({ projectPath });
    if (result.status === 'already-active') {
      reply.code(409);
      return { error: 'setup-already-active', runId: result.runId };
    }

    logger.info({ runId: result.runId }, 'Setup wizard run started');
    return { runId: result.runId };
  });

  const inputRunIdSchema = z.object({ runId: z.string().min(1) });

  fastify.post('/api/setup/input', async (request, reply) => {
    const runIdResult = inputRunIdSchema.safeParse(request.body);
    const inputResult = setupInputGuard.safeParse(request.body);
    if (!runIdResult.success || !inputResult.success) {
      reply.code(400);
      return { error: 'invalid-input' };
    }

    const line = serializeSetupInput(inputResult.data);
    const result = registry.submitInput(runIdResult.data.runId, line);
    if (result.status === 'no-active-run') {
      reply.code(409);
      return { error: 'no-active-run' };
    }

    return { status: 'written' };
  });

  fastify.post('/api/setup/cancel', async (_request, reply) => {
    const result = registry.cancel();
    if (result.status === 'no-active-run') {
      reply.code(409);
      return { error: 'no-active-run' };
    }

    logger.info('Setup wizard run cancelled');
    return { status: 'cancelled' };
  });

  fastify.get('/api/setup/state', async () => {
    const loaded = setupStateGateway.load();
    return { state: loaded.state, corrupted: loaded.corrupted };
  });

  fastify.get('/api/setup/events', async (request, reply): Promise<void> => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ error: 'missing-run-id' });
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    await new Promise<void>((resolve) => {
      let settled = false;
      let unsubscribe: () => void = () => {};
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        resolve();
      };

      unsubscribe = registry.subscribe(parsed.data.runId, {
        onEvent: (line) => {
          const event = parseLine(line);
          if (event !== null) {
            reply.raw.write(`data: ${event}\n\n`);
          }
        },
        onClose: (code) => {
          reply.raw.write(`event: end\ndata: ${JSON.stringify({ code })}\n\n`);
          finish();
        },
      });

      request.raw.on('close', finish);
    });
  });
};
