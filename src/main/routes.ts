import type { FastifyInstance } from 'fastify';
import type { Dependencies } from './dependencies.js';
import { healthRoutes } from '../interface-adapters/controllers/http/health.routes.js';
import { settingsRoutes } from '../interface-adapters/controllers/http/settings.routes.js';
import { reviewRoutes } from '../interface-adapters/controllers/http/reviews.routes.js';
import { statsRoutes } from '../interface-adapters/controllers/http/stats.routes.js';
import { mrTrackingRoutes } from '../interface-adapters/controllers/http/mrTracking.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  deps: Dependencies
): Promise<void> {
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
}
