import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { loadConfig, type Config } from '../config/loader.js';
import { createDependencies, type Dependencies } from './dependencies.js';
import { registerRoutes } from './routes.js';
import { setupWebSocketCallbacks } from './websocket.js';
import { initQueue } from '../frameworks/queue/pQueueAdapter.js';
import { removePidFile } from '../shared/services/pidFileManager.js';
import { PID_FILE_PATH } from '../shared/services/daemonPaths.js';

export interface ServerOptions {
  config?: Config;
  portOverride?: number;
}

function addRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      (req as typeof req & { rawBody: Buffer }).rawBody = body;
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );
}

async function buildServer(deps: Dependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  addRawBodyParser(app);
  await app.register(fastifyWebsocket);
  await registerRoutes(app, deps);

  return app;
}

export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const deps = createDependencies(config);

  return buildServer(deps);
}

export async function startServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const deps = createDependencies(config);

  initQueue(deps.logger);
  setupWebSocketCallbacks({
    reviewContextWatcher: deps.reviewContextWatcher,
    progressPresenter: deps.progressPresenter,
  });

  const app = await buildServer(deps);
  const port = options.portOverride ?? config.server.port;

  await app.listen({
    port,
    host: '0.0.0.0',
  });

  const shutdown = async () => {
    deps.logger.info('Shutting down...');
    removePidFile(PID_FILE_PATH);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}
