import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { pino } from 'pino';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig, loadEnvSecrets } from './config/loader.js';
import { initQueue, getQueueStats, getJobsStatus } from './queue/reviewQueue.js';
import { handleGitLabWebhook } from './webhooks/gitlab.handler.js';
import { handleGitHubWebhook } from './webhooks/github.handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

async function main() {
  // Load and validate configuration
  logger.info('Chargement de la configuration...');
  const config = loadConfig();
  loadEnvSecrets(); // Validate secrets are present
  logger.info(
    {
      port: config.server.port,
      repositories: config.repositories.filter(r => r.enabled).length,
      gitlabUser: config.user.gitlabUsername,
      githubUser: config.user.githubUsername,
    },
    'Configuration chargée'
  );

  // Initialize queue
  initQueue(logger);
  logger.info(
    { maxConcurrent: config.queue.maxConcurrent },
    'Queue initialisée'
  );

  // Create Fastify server
  const server = Fastify({
    logger: false, // We use our own logger
  });

  // Serve dashboard static files
  await server.register(fastifyStatic, {
    root: join(__dirname, 'dashboard'),
    prefix: '/dashboard/',
  });

  // Add raw body support for GitHub HMAC verification
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      // Store raw body for signature verification
      (req as typeof req & { rawBody: Buffer }).rawBody = body;
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Health check endpoint
  server.get('/health', async () => {
    const stats = getQueueStats();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: stats,
    };
  });

  // Status endpoint - shows active and recent reviews
  server.get('/status', async () => {
    const jobs = getJobsStatus();
    const stats = getQueueStats();
    return {
      timestamp: new Date().toISOString(),
      queue: stats,
      activeReviews: jobs.active,
      recentReviews: jobs.recent,
    };
  });

  // GitLab webhook endpoint
  server.post('/webhooks/gitlab', async (request, reply) => {
    await handleGitLabWebhook(request, reply, logger);
  });

  // GitHub webhook endpoint
  server.post('/webhooks/github', async (request, reply) => {
    await handleGitHubWebhook(request, reply, logger);
  });

  // Root endpoint - redirect to dashboard
  server.get('/', async (_request, reply) => {
    reply.redirect('/dashboard/');
  });

  // API info endpoint
  server.get('/api', async () => {
    return {
      name: 'claude-review-automation',
      version: '1.0.0',
      endpoints: {
        dashboard: '/dashboard/',
        health: '/health',
        status: '/status',
        gitlab: '/webhooks/gitlab',
        github: '/webhooks/github',
      },
    };
  });

  // Start server
  try {
    await server.listen({
      port: config.server.port,
      host: '0.0.0.0', // Listen on all interfaces for tunnel access
    });
    logger.info(
      { port: config.server.port },
      'Serveur démarré'
    );
  } catch (err) {
    logger.fatal({ err }, 'Erreur au démarrage du serveur');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Arrêt en cours...');
    await server.close();
    logger.info('Serveur arrêté');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Erreur fatale');
  process.exit(1);
});
