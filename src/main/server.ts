import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type Config } from '../config/loader.js';
import { createDependencies, type Dependencies } from './dependencies.js';
import { registerRoutes } from './routes.js';

export interface ServerOptions {
  config?: Config;
}

export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const deps = createDependencies(config);

  const app = Fastify({
    logger: false,
  });

  await registerRoutes(app, deps);

  return app;
}

export async function startServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const deps = createDependencies(config);

  const app = Fastify({
    logger: deps.logger,
  });

  await registerRoutes(app, deps);

  await app.listen({
    port: config.server.port,
    host: '0.0.0.0',
  });

  const shutdown = async () => {
    deps.logger.info('Shutting down...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}
