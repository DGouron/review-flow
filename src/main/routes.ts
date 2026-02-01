import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Dependencies } from './dependencies.js';
import { healthRoutes } from '../interface-adapters/controllers/http/health.routes.js';
import { settingsRoutes } from '../interface-adapters/controllers/http/settings.routes.js';
import { reviewRoutes } from '../interface-adapters/controllers/http/reviews.routes.js';
import { statsRoutes } from '../interface-adapters/controllers/http/stats.routes.js';
import { mrTrackingRoutes } from '../interface-adapters/controllers/http/mrTracking.routes.js';
import { mrTrackingAdvancedRoutes } from '../interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { logsRoutes } from '../interface-adapters/controllers/http/logs.routes.js';
import { cliStatusRoutes } from '../interface-adapters/controllers/http/cliStatus.routes.js';
import { projectConfigRoutes } from '../interface-adapters/controllers/http/projectConfig.routes.js';
import { registerWebSocketRoutes } from './websocket.js';
import { handleGitLabWebhook } from '../interface-adapters/controllers/webhook/gitlab.controller.js';
import { handleGitHubWebhook } from '../interface-adapters/controllers/webhook/github.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function registerRoutes(
  app: FastifyInstance,
  deps: Dependencies
): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'interface-adapters', 'views', 'dashboard'),
    prefix: '/dashboard/',
  });

  await app.register(healthRoutes, {
    getConfig: () => ({ version: '1.0.0' }),
  });

  await app.register(settingsRoutes);

  await app.register(reviewRoutes, {
    reviewFileGateway: deps.reviewFileGateway,
    getRepositories: () => deps.config.repositories,
  });

  await app.register(statsRoutes, {
    statsGateway: deps.statsGateway,
    getRepositories: () => deps.config.repositories,
  });

  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
  });

  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => deps.config.repositories,
    logger: deps.logger,
  });

  await app.register(logsRoutes);
  await app.register(cliStatusRoutes);
  await app.register(projectConfigRoutes);

  await registerWebSocketRoutes(app, deps.logger);

  app.post('/webhooks/gitlab', async (request, reply) => {
    await handleGitLabWebhook(request, reply, deps.logger);
  });

  app.post('/webhooks/github', async (request, reply) => {
    await handleGitHubWebhook(request, reply, deps.logger);
  });

  app.get('/', async (_request, reply) => {
    reply.redirect('/dashboard/');
  });

  app.get('/api', async () => {
    return {
      name: 'claude-review-automation',
      version: '1.0.0',
      endpoints: {
        dashboard: '/dashboard/',
        health: '/health',
        status: '/api/status',
        gitlab: '/webhooks/gitlab',
        github: '/webhooks/github',
      },
    };
  });
}
