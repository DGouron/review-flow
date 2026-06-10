import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';

import { startClaudeInvocationTimers } from '@/frameworks/claude/timers/claudeInvocationTimers.js';
import { startSupervisorScheduler } from '@/frameworks/scheduler/supervisorScheduler.js';
import {
  configureSettingsLogger,
  configureSettingsPath,
  getDefaultSettingsPath,
  loadSettingsFromDisk,
} from '@/frameworks/settings/runtimeSettings.js';
import { InMemorySupervisorHealthGateway } from '@/modules/claude-invocation/interface-adapters/gateways/supervisorHealth.memory.gateway.js';
import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';
import type { JobStatus } from '@/modules/review-execution/entities/job/reviewJob.js';
import { JobHistoryFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { runReviewRecovery } from '@/modules/review-execution/services/reviewRecovery.service.js';
import { defaultCommandExecutor } from '@/modules/review-execution/services/threadActionsExecutor.js';
import { LoadRecentJobHistoryUseCase } from '@/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.js';
import { PersistJobRecordUseCase } from '@/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.js';
import { PruneJobHistoryUseCase } from '@/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.js';
import {
  SupervisorCliGateway,
  createDefaultSupervisorProbe,
  createDefaultSupervisorSpawner,
} from '@/modules/supervisor-management/interface-adapters/gateways/supervisor.cli.gateway.js';
import {
  SupervisorLockFileSystemGateway,
  createDefaultSupervisorLockFileSystem,
  getDefaultSupervisorLockFilePath,
} from '@/modules/supervisor-management/interface-adapters/gateways/supervisorLock.fileSystem.gateway.js';
import { transportTrustProxyValue } from '@/security/transportGuardConfig.js';

import { loadConfig, type Config } from '../config/loader.js';
import {
  initQueue,
  replaceCompletedJobs,
  setPersistJobRecordCallback,
} from '../frameworks/queue/pQueueAdapter.js';
import { startCleanupScheduler } from '../frameworks/scheduler/cleanupScheduler.js';
import { startWorktreeSweepScheduler } from '../frameworks/scheduler/worktreeSweepScheduler.js';
import { PID_FILE_PATH } from '../shared/services/daemonPaths.js';
import { removePidFile } from '../shared/services/pidFileManager.js';
import { createDependencies, type Dependencies } from './dependencies.js';
import { registerRoutes } from './routes.js';
import { setupWebSocketCallbacks } from './websocket.js';

export interface ServerOptions {
  config?: Config;
  portOverride?: number;
}

function addRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    Object.assign(req, { rawBody: body });
    try {
      const json = JSON.parse(body.toString());
      done(null, json);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)), undefined);
    }
  });
}

// Revives a historical JobRecord into a JobStatus to seed the in-memory recent list at startup.
//
// KNOWN LIMITATIONS (acknowledged in PR #227 review, follow-ups tracked outside SPEC-176):
//
// 1. Status granularity loss: JobRecord persists 4 outcomes (success/failed/killed/timeout),
//    but the runtime JobStatus.status only knows queued/running/completed/failed. After a
//    daemon restart, killed and timeout outcomes collapse to 'failed' here; the original
//    distinction survives only via the `error` field (populated from `exitReason`).
//    Real fix requires extending JobStatus.status — out of SPEC-176 scope.
//
// 2. Empty-string placeholders: ReviewJob fields localPath/mrUrl/sourceBranch/targetBranch/skill
//    are typed `string` (non-nullable) but not persisted by SPEC-176. Revived jobs assign ''
//    so downstream display code must treat empty strings as "no value" — most dashboard
//    consumers already guard defensively (sanitizeHttpUrl, length checks). Real fix requires
//    narrowing those fields to `string | null` in ReviewJob — out of SPEC-176 scope.
function reviveJobStatusFromRecord(record: JobRecord): JobStatus {
  return {
    job: {
      id: record.jobId,
      platform: record.platform,
      projectPath: record.projectPath,
      localPath: '',
      mrNumber: record.mergeRequestId,
      skill: '',
      mrUrl: '',
      sourceBranch: '',
      targetBranch: '',
      jobType: record.jobType,
    },
    status: record.status === 'success' ? 'completed' : 'failed',
    startedAt: new Date(record.startedAt),
    completedAt: new Date(record.completedAt),
    error: record.exitReason ?? undefined,
  };
}

async function buildServer(deps: Dependencies): Promise<FastifyInstance> {
  // trust proxy is scoped to the single loopback hop only (never true, never a
  // broad subnet) so Fastify does not inflate request attributes from client
  // headers; the accept/reject decision lives entirely in the transport guard.
  const app = Fastify({ logger: false, trustProxy: transportTrustProxyValue() });

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

  configureSettingsPath(getDefaultSettingsPath());
  configureSettingsLogger(deps.logger);
  await loadSettingsFromDisk();

  initQueue(deps.logger);

  const jobHistoryGateway = new JobHistoryFileSystemGateway({ logger: deps.logger });
  const persistJobRecord = new PersistJobRecordUseCase({
    jobHistoryGateway,
    logger: deps.logger,
  });
  const loadRecentJobHistory = new LoadRecentJobHistoryUseCase({
    jobHistoryGateway,
    logger: deps.logger,
  });
  const pruneJobHistory = new PruneJobHistoryUseCase({
    jobHistoryGateway,
    logger: deps.logger,
  });

  await pruneJobHistory.execute({
    retentionDays: config.queue.jobHistoryRetentionDays,
    now: () => new Date(),
  });
  const recentRecords = await loadRecentJobHistory.execute({
    retentionDays: config.queue.jobHistoryRetentionDays,
    now: () => new Date(),
  });
  replaceCompletedJobs(recentRecords.map(reviveJobStatusFromRecord));

  setPersistJobRecordCallback(async (jobStatus, abortSignalAborted) => {
    await persistJobRecord.execute({
      jobStatus,
      abortSignalAborted,
      now: () => new Date(),
    });
  });

  setupWebSocketCallbacks({
    reviewContextWatcher: deps.reviewContextWatcher,
    progressPresenter: deps.progressPresenter,
  });

  const cleanupScheduler = startCleanupScheduler({
    reviewFileGateway: deps.reviewFileGateway,
    reviewLogFileGateway: deps.reviewLogFileGateway,
    getRepositories: () => config.repositories,
    logger: deps.logger,
  });

  const worktreeSweepScheduler = startWorktreeSweepScheduler({
    worktreeGateway: deps.worktreeGateway,
    trackingGateway: deps.reviewRequestTrackingGateway,
    getRepositories: () => config.repositories,
    logger: deps.logger,
    now: () => new Date(),
  });

  deps.sweepSchedulerControls = {
    getLastSweep: () => worktreeSweepScheduler.getLastSweep(),
    getNextSweepEta: () => worktreeSweepScheduler.getNextSweepEta(),
    runSweepNow: () => worktreeSweepScheduler.runSweepNow(),
  };

  const app = await buildServer(deps);
  const port = options.portOverride ?? config.server.port;

  const supervisorGateway = new SupervisorCliGateway({
    probe: createDefaultSupervisorProbe(),
    spawn: createDefaultSupervisorSpawner(),
  });
  const supervisorLockGateway = new SupervisorLockFileSystemGateway({
    lockFilePath: getDefaultSupervisorLockFilePath(),
    currentPid: process.pid,
    fileSystem: createDefaultSupervisorLockFileSystem(),
  });
  const supervisorScheduler = startSupervisorScheduler({
    supervisorGateway,
    lockGateway: supervisorLockGateway,
    statusStore: deps.supervisorStatusStore,
    logger: deps.logger,
    now: () => new Date(),
    intervalMs: 60_000,
  });

  // Supervisor health has its own gateway because it is not consumed by the
  // review dispatch path (only by the dashboard). Billing state and session
  // gateway, in contrast, must be shared so a paused billing state pauses
  // dispatch, and so timers and reviews talk to the same Claude CLI.
  const supervisorHealthGateway = new InMemorySupervisorHealthGateway();
  const stopClaudeInvocationTimers = startClaudeInvocationTimers({
    sessionGateway: deps.claudeInvocationDeps.sessionGateway,
    supervisorHealthGateway,
    billingStateGateway: deps.claudeInvocationDeps.billingState,
    now: () => new Date(),
    supervisorIntervalMs: 5 * 60 * 1000,
    billingIntervalMs: 60 * 60 * 1000,
  });

  await app.listen({
    port,
    host: '0.0.0.0',
  });

  // Recovery runs as a non-blocking background task so the HTTP listener is
  // available immediately at boot. A long replay backlog can't delay health
  // checks or webhook reception.
  void (async () => {
    try {
      const summary = await runReviewRecovery({
        repositories: config.repositories.filter((repo) => repo.enabled),
        reviewContextGateway: deps.reviewContextGateway,
        executeActions: async (context, localPath) => {
          const result = await executeActionsFromContext(
            context,
            localPath,
            deps.logger,
            defaultCommandExecutor,
          );
          return { posted: result.succeeded, failed: result.failed };
        },
        now: () => Date.now(),
        logger: deps.logger,
      });
      deps.logger.info(summary, 'Review recovery completed in background');
    } catch (error) {
      deps.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Review recovery threw unexpectedly',
      );
    }
  })();

  const shutdown = async () => {
    deps.logger.info('Shutting down...');
    cleanupScheduler.stop();
    worktreeSweepScheduler.stop();
    stopClaudeInvocationTimers();
    supervisorScheduler.stop();
    removePidFile(PID_FILE_PATH);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}
