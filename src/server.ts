import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { pino } from 'pino';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { WebSocket } from 'ws';
import { loadConfig, loadEnvSecrets } from './config/loader.js';
import { initQueue, getQueueStats, getJobsStatus, setProgressChangeCallback, setStateChangeCallback, cancelJob } from './queue/reviewQueue.js';
import { handleGitLabWebhook } from './interface-adapters/controllers/webhook/gitlab.controller.js';
import { handleGitHubWebhook } from './interface-adapters/controllers/webhook/github.controller.js';
import type { ReviewProgress, ProgressEvent } from './types/progress.js';
import { getLogs, getErrorLogs, onLog, logInfo, logWarn, logError, type LogEntry } from './services/logService.js';
import { getModel, setModel, getSettings, type ClaudeModel } from './services/runtimeSettings.js';
import { loadProjectStats, getStatsSummary } from './services/statsService.js';
import {
  getPendingFixMrs,
  getPendingApprovalMrs,
  approveMr,
} from './services/mrTrackingService.js';

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

  // Register WebSocket plugin
  await server.register(fastifyWebsocket);

  // Track connected WebSocket clients
  const wsClients = new Set<WebSocket>();

  /**
   * Broadcast progress update to all connected WebSocket clients
   */
  function broadcastProgress(jobId: string, progress: ReviewProgress, event?: ProgressEvent): void {
    const message = JSON.stringify({
      type: 'progress',
      jobId,
      progress,
      event,
      timestamp: new Date().toISOString(),
    });

    for (const client of wsClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  /**
   * Broadcast log entry to all connected WebSocket clients
   */
  const broadcastLogEntry = (log: LogEntry): void => {
    const message = JSON.stringify({
      type: 'log',
      log,
    });

    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  };

  // Subscribe to log service for broadcasting
  onLog(broadcastLogEntry);

  /**
   * Broadcast state change (jobs list update) to all connected WebSocket clients
   */
  function broadcastStateChange(): void {
    const jobs = getJobsStatus();
    const message = JSON.stringify({
      type: 'state',
      activeReviews: jobs.active,
      recentReviews: jobs.recent,
      timestamp: new Date().toISOString(),
    });

    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  // Add initial startup log
  logInfo('Serveur démarré', { port: config.server.port });

  // Set up progress change callback to broadcast to WebSocket clients
  setProgressChangeCallback((jobId, progress, event) => {
    broadcastProgress(jobId, progress, event);
  });

  // Set up state change callback to broadcast queue state changes
  setStateChangeCallback(() => {
    broadcastStateChange();
  });

  // Serve dashboard static files
  await server.register(fastifyStatic, {
    root: join(__dirname, 'interface-adapters', 'views', 'dashboard'),
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

  // WebSocket endpoint for real-time progress updates
  server.get('/ws', { websocket: true }, (connection) => {
    const socket = connection.socket;
    logger.info('WebSocket client connected');
    wsClients.add(socket);

    // Send current status immediately on connection
    const jobs = getJobsStatus();
    socket.send(JSON.stringify({
      type: 'init',
      activeReviews: jobs.active,
      recentReviews: jobs.recent,
      timestamp: new Date().toISOString(),
    }));

    socket.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        // Handle ping/pong for keep-alive
        if (data.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    socket.on('close', () => {
      logger.info('WebSocket client disconnected');
      wsClients.delete(socket);
    });

    socket.on('error', (error: Error) => {
      logger.warn({ error }, 'WebSocket error');
      wsClients.delete(socket);
    });
  });

  // Health check endpoint
  server.get('/health', async () => {
    const stats = getQueueStats();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: stats,
      wsClients: wsClients.size,
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

  // Logs endpoint - returns recent logs
  server.get('/api/logs', async (request) => {
    const query = request.query as { errors?: string };
    const logs = query.errors === 'true' ? getErrorLogs() : getLogs();
    return {
      logs,
      count: logs.length,
    };
  });

  // Settings endpoint - get current settings
  server.get('/api/settings', async () => {
    return getSettings();
  });

  // Model endpoint - get/set model
  server.get('/api/settings/model', async () => {
    return { model: getModel() };
  });

  server.post('/api/settings/model', async (request) => {
    const body = request.body as { model?: string };
    const model = body?.model;

    if (model !== 'sonnet' && model !== 'opus') {
      return { success: false, message: 'Modèle invalide (sonnet ou opus)' };
    }

    setModel(model as ClaudeModel);
    logInfo('Modèle changé', { model });
    return { success: true, model, message: `Modèle changé pour ${model}` };
  });

  // Review files endpoint - list review files (optionally filtered by project path)
  server.get('/api/reviews', async (request) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

    const reviews: Array<{
      filename: string;
      path: string;
      date: string;
      mrNumber: string;
      type: string;
      size: number;
      mtime: string;
    }> = [];

    // If project path specified, only look in that project
    const dirsToSearch: string[] = [];

    if (projectPath) {
      // Security check
      if (!projectPath.startsWith('/') || projectPath.includes('..')) {
        return { reviews: [], count: 0, error: 'Invalid path' };
      }
      dirsToSearch.push(join(projectPath, '.claude', 'reviews'));
    } else {
      // Fall back to all configured repositories
      for (const repo of config.repositories) {
        if (repo.enabled) {
          dirsToSearch.push(join(repo.localPath, '.claude', 'reviews'));
        }
      }
    }

    for (const reviewsDir of dirsToSearch) {
      try {
        const files = await readdir(reviewsDir);
        for (const filename of files) {
          if (!filename.endsWith('.md')) continue;

          const filePath = join(reviewsDir, filename);
          const fileStat = await stat(filePath);

          // Parse filename: 2026-01-30-MR-4724-review.md
          const match = filename.match(/^(\d{4}-\d{2}-\d{2})-MR-([^-]+)-(.+)\.md$/);
          if (match) {
            reviews.push({
              filename,
              path: filePath,
              date: match[1],
              mrNumber: match[2],
              type: match[3],
              size: fileStat.size,
              mtime: fileStat.mtime.toISOString(),
            });
          }
        }
      } catch {
        // Directory doesn't exist or not readable
      }
    }

    // Sort by date descending
    reviews.sort((a, b) => b.mtime.localeCompare(a.mtime));

    return { reviews, count: reviews.length };
  });

  // Read specific review file
  server.get('/api/reviews/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Security: validate filename format
    if (!filename.match(/^\d{4}-\d{2}-\d{2}-MR-[^/\\]+\.md$/)) {
      reply.code(400);
      return { error: 'Invalid filename format' };
    }

    for (const repo of config.repositories) {
      if (!repo.enabled) continue;
      const filePath = join(repo.localPath, '.claude', 'reviews', filename);

      try {
        const content = await readFile(filePath, 'utf-8');
        return { filename, content };
      } catch {
        // File not found in this repo, try next
      }
    }

    reply.code(404);
    return { error: 'Review not found' };
  });

  // Delete specific review file
  server.delete('/api/reviews/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Security: validate filename format
    if (!filename.match(/^\d{4}-\d{2}-\d{2}-MR-[^/\\]+\.md$/)) {
      reply.code(400);
      return { success: false, error: 'Invalid filename format' };
    }

    const { unlink } = await import('node:fs/promises');

    for (const repo of config.repositories) {
      if (!repo.enabled) continue;
      const filePath = join(repo.localPath, '.claude', 'reviews', filename);

      try {
        await unlink(filePath);
        logInfo('Review supprimée', { filename });
        return { success: true, filename };
      } catch {
        // File not found in this repo, try next
      }
    }

    reply.code(404);
    return { success: false, error: 'Review not found' };
  });

  // Cancel a running review job
  server.post('/api/reviews/cancel/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    if (!jobId || jobId.length === 0) {
      reply.code(400);
      return { success: false, error: 'Job ID requis' };
    }

    const cancelled = cancelJob(jobId);

    if (cancelled) {
      logInfo('Annulation demandée', { jobId });
      return { success: true, jobId, message: 'Annulation en cours' };
    } else {
      reply.code(404);
      return { success: false, error: 'Job non trouvé ou déjà terminé' };
    }
  });

  // Project stats endpoint - get review statistics for a project
  server.get('/api/stats', async (request, reply) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

    if (!projectPath) {
      reply.code(400);
      return { success: false, error: 'Chemin du projet requis' };
    }

    // Security check
    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Chemin invalide' };
    }

    try {
      const stats = loadProjectStats(projectPath);
      const summary = getStatsSummary(stats);
      return {
        success: true,
        stats,
        summary,
      };
    } catch (error) {
      const err = error as Error;
      logError('Erreur lecture stats', { projectPath, error: err.message });
      return { success: false, error: err.message };
    }
  });

  // MR tracking endpoint - get tracked MRs for a project
  server.get('/api/mr-tracking', async (request, reply) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

    if (!projectPath) {
      reply.code(400);
      return { success: false, error: 'Chemin du projet requis' };
    }

    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Chemin invalide' };
    }

    try {
      const pendingFix = getPendingFixMrs(projectPath);
      const pendingApproval = getPendingApprovalMrs(projectPath);
      return {
        success: true,
        pendingFix,
        pendingApproval,
      };
    } catch (error) {
      const err = error as Error;
      logError('Erreur lecture MR tracking', { projectPath, error: err.message });
      return { success: false, error: err.message };
    }
  });

  // Trigger followup review for a MR
  server.post('/api/mr-tracking/followup', async (request, reply) => {
    const body = request.body as { mrId?: string; projectPath?: string };
    const { mrId, projectPath } = body;

    if (!mrId || !projectPath) {
      reply.code(400);
      return { success: false, error: 'mrId et projectPath requis' };
    }

    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Chemin invalide' };
    }

    // Parse mrId to get platform, project, and mrNumber
    const match = mrId.match(/^(gitlab|github)-(.+)-(\d+)$/);
    if (!match) {
      reply.code(400);
      return { success: false, error: 'Format mrId invalide' };
    }

    const [, platform, , mrNumberStr] = match;
    const mrNumber = parseInt(mrNumberStr, 10);

    // Find matching repository config
    const repo = config.repositories.find((r) => r.localPath === projectPath && r.enabled);
    if (!repo) {
      reply.code(404);
      return { success: false, error: 'Repository non configuré' };
    }

    // Import and use the queue to add a followup job
    const { enqueueReview, createJobId, updateJobProgress } = await import('./queue/reviewQueue.js');
    const { loadProjectConfig } = await import('./config/projectConfig.js');
    const { invokeClaudeReview, sendNotification } = await import('./claude/invoker.js');

    const projectConfig = loadProjectConfig(projectPath);
    const skill = projectConfig?.reviewFollowupSkill || 'review-followup';

    // Extract project path from remoteUrl
    const gitProjectPath = repo.remoteUrl
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/\.git$/, '');

    const jobId = createJobId(`${platform}-followup`, gitProjectPath, mrNumber);

    // Build MR URL based on platform
    const mrUrl = platform === 'gitlab'
      ? `${repo.remoteUrl.replace(/\.git$/, '')}/-/merge_requests/${mrNumber}`
      : `${repo.remoteUrl.replace(/\.git$/, '')}/pull/${mrNumber}`;

    const enqueued = await enqueueReview({
      id: jobId,
      platform: platform as 'gitlab' | 'github',
      projectPath: gitProjectPath,
      localPath: repo.localPath,
      mrNumber,
      mrUrl,
      skill,
      sourceBranch: 'unknown',
      targetBranch: 'unknown',
    }, async (job, signal) => {
      sendNotification('Review followup démarrée', `MR !${job.mrNumber}`, logger);

      const result = await invokeClaudeReview(job, logger, (progress, event) => {
        updateJobProgress(job.id, progress, event);
      }, signal);

      if (result.success) {
        sendNotification('Review followup terminée', `MR !${job.mrNumber}`, logger);
      } else if (!result.cancelled) {
        sendNotification('Review followup échouée', `MR !${job.mrNumber}`, logger);
      }
    });

    if (!enqueued) {
      return { success: false, error: 'Review déjà en cours ou récemment effectuée' };
    }

    logInfo('Followup déclenché manuellement', { mrId, mrNumber, skill });

    return { success: true, jobId, message: 'Followup review en cours' };
  });

  // Approve a MR (mark as ready for merge)
  server.post('/api/mr-tracking/approve', async (request, reply) => {
    const body = request.body as { mrId?: string; projectPath?: string };
    const { mrId, projectPath } = body;

    if (!mrId || !projectPath) {
      reply.code(400);
      return { success: false, error: 'mrId et projectPath requis' };
    }

    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Chemin invalide' };
    }

    const approved = approveMr(projectPath, mrId);

    if (approved) {
      logInfo('MR approuvée', { mrId });
      return { success: true, mrId, message: 'MR marquée comme approuvée' };
    } else {
      reply.code(404);
      return { success: false, error: 'MR non trouvée' };
    }
  });

  // Sync threads from GitLab for all active MRs
  server.post('/api/mr-tracking/sync', async (request, reply) => {
    const body = request.body as { projectPath?: string; mrId?: string };
    const { projectPath, mrId } = body;

    if (!projectPath) {
      reply.code(400);
      return { success: false, error: 'projectPath requis' };
    }

    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Chemin invalide' };
    }

    try {
      const { syncAllThreads, syncSingleMrThreads, loadMrTracking } = await import('./services/mrTrackingService.js');

      if (mrId) {
        // Sync single MR/PR
        const mr = syncSingleMrThreads(projectPath, mrId);
        if (mr) {
          logInfo('MR/PR synced', { mrId, openThreads: mr.openThreads, state: mr.state });
          return { success: true, mr };
        } else {
          reply.code(404);
          return { success: false, error: 'MR/PR non trouvée' };
        }
      } else {
        // Sync all active MRs/PRs (both GitLab and GitHub)
        await syncAllThreads(projectPath);
        const data = loadMrTracking(projectPath);
        logInfo('All MRs/PRs synced', { count: data.mrs.length });
        return { success: true, mrs: data.mrs };
      }
    } catch (err) {
      const error = err as Error;
      logError('Sync failed', { error: error.message });
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Project config endpoint - load config from project's .claude/reviews/config.json
  server.get('/api/project-config', async (request, reply) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

    if (!projectPath) {
      reply.code(400);
      return { success: false, error: 'Chemin du projet requis' };
    }

    // Security: ensure path is absolute and doesn't contain ..
    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Chemin invalide (doit être absolu sans ..)' };
    }

    const configPath = join(projectPath, '.claude', 'reviews', 'config.json');

    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Validate required fields
      const requiredFields = ['github', 'gitlab', 'defaultModel', 'reviewSkill', 'reviewFollowupSkill'];
      const missingFields = requiredFields.filter(field => !(field in config));
      if (missingFields.length > 0) {
        return { success: false, error: `Champs manquants: ${missingFields.join(', ')}` };
      }

      // Validate agents array if present
      if ('agents' in config && config.agents !== undefined) {
        if (!Array.isArray(config.agents)) {
          return { success: false, error: 'Le champ "agents" doit être un tableau' };
        }
        for (const agent of config.agents) {
          if (
            !agent ||
            typeof agent !== 'object' ||
            typeof agent.name !== 'string' ||
            typeof agent.displayName !== 'string' ||
            agent.name.length === 0 ||
            agent.displayName.length === 0
          ) {
            return {
              success: false,
              error: 'Format agents invalide: chaque agent doit avoir { name: string, displayName: string }',
            };
          }
        }
      }

      // Validate skills exist
      const skillsPath = join(projectPath, '.claude', 'skills');
      const skillErrors: string[] = [];

      // Check reviewSkill
      const reviewSkillPath = join(skillsPath, config.reviewSkill, 'SKILL.md');
      try {
        await stat(reviewSkillPath);
      } catch {
        skillErrors.push(`reviewSkill "${config.reviewSkill}" introuvable (${reviewSkillPath})`);
      }

      // Check reviewFollowupSkill
      const followupSkillPath = join(skillsPath, config.reviewFollowupSkill, 'SKILL.md');
      try {
        await stat(followupSkillPath);
      } catch {
        skillErrors.push(`reviewFollowupSkill "${config.reviewFollowupSkill}" introuvable (${followupSkillPath})`);
      }

      if (skillErrors.length > 0) {
        return { success: false, error: skillErrors.join(' | ') };
      }

      logInfo('Config projet chargée', { projectPath, config });
      return { success: true, config, path: configPath };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: 'Fichier config.json non trouvé dans .claude/reviews/' };
      }
      logError('Erreur lecture config projet', { projectPath, error: err.message });
      return { success: false, error: 'Erreur de lecture: ' + err.message };
    }
  });

  // Claude status check endpoint
  server.get('/api/claude/status', async () => {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Check Claude CLI version
      const child = spawn('claude', ['--version'], {
        timeout: 10000,
        env: { ...process.env, TERM: 'dumb' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logError('Claude CLI non disponible', { error: error.message });
        resolve({
          available: false,
          error: error.message,
          message: 'Claude CLI non installé ou non accessible',
        });
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          const version = stdout.trim();
          logInfo('Claude CLI vérifié', { version, duration });
          resolve({
            available: true,
            version,
            duration,
            message: 'Claude CLI opérationnel',
          });
        } else {
          logWarn('Claude CLI erreur', { code, stderr, duration });
          resolve({
            available: false,
            exitCode: code,
            stderr: stderr.trim(),
            message: stderr.includes('not logged in')
              ? 'Non authentifié - exécutez "claude login"'
              : 'Erreur Claude CLI',
          });
        }
      });
    });
  });

  // GitLab CLI status check endpoint - uses 'glab api user' for reliable check
  server.get('/api/gitlab/status', async () => {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Use 'glab api user' instead of 'glab auth status' (more reliable)
      const child = spawn('glab', ['api', 'user'], {
        timeout: 10000,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logError('GitLab CLI non disponible', { error: error.message });
        resolve({
          available: false,
          authenticated: false,
          error: error.message,
          message: 'GitLab CLI (glab) non installé',
          command: 'sudo apt install glab',
        });
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          try {
            const user = JSON.parse(stdout);
            logInfo('GitLab CLI vérifié', { username: user.username, duration });
            resolve({
              available: true,
              authenticated: true,
              username: user.username,
              duration,
              message: 'GitLab CLI opérationnel',
            });
          } catch {
            logWarn('GitLab CLI réponse invalide', { duration });
            resolve({
              available: true,
              authenticated: false,
              message: 'Réponse GitLab invalide',
            });
          }
        } else {
          logWarn('GitLab CLI non authentifié', { code, stderr, duration });
          resolve({
            available: true,
            authenticated: false,
            message: 'Non authentifié à GitLab',
          });
        }
      });
    });
  });

  // GitHub CLI status check endpoint - uses 'gh api user' for reliable check
  server.get('/api/github/status', async () => {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const child = spawn('gh', ['api', 'user'], {
        timeout: 10000,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logError('GitHub CLI non disponible', { error: error.message });
        resolve({
          available: false,
          authenticated: false,
          error: error.message,
          message: 'GitHub CLI (gh) non installé',
          command: 'sudo apt install gh',
        });
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          try {
            const user = JSON.parse(stdout);
            logInfo('GitHub CLI vérifié', { username: user.login, duration });
            resolve({
              available: true,
              authenticated: true,
              username: user.login,
              duration,
              message: 'GitHub CLI opérationnel',
            });
          } catch {
            logWarn('GitHub CLI réponse invalide', { duration });
            resolve({
              available: true,
              authenticated: false,
              message: 'Réponse GitHub invalide',
            });
          }
        } else {
          logWarn('GitHub CLI non authentifié', { code, stderr, duration });
          resolve({
            available: true,
            authenticated: false,
            message: 'Non authentifié - exécutez: gh auth login',
          });
        }
      });
    });
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
