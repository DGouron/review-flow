import { mkdirSync } from 'node:fs';

import { pino, type Logger, type LoggerOptions } from 'pino';

import {
  createDefaultClaudeInvocationDeps,
  type ClaudeInvocationDeps,
} from '@/frameworks/claude/claudeInvoker.js';
import type { ReviewLogFileGateway } from '@/modules/data-lifecycle/entities/reviewLog/reviewLogFile.gateway.js';
import { FileSystemReviewLogFileGateway } from '@/modules/data-lifecycle/interface-adapters/gateways/fileSystem/reviewLogFile.fileSystem.gateway.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import { FileSystemReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/reviewFile.fileSystem.js';
import { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import type { ReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewFile.gateway.js';
import { ReviewContextProgressPresenter } from '@/modules/review-execution/interface-adapters/presenters/reviewContextProgress.presenter.js';
import { ReviewContextWatcherService } from '@/modules/review-execution/services/reviewContextWatcher.service.js';
import type { InsightsGateway } from '@/modules/statistics-insights/entities/insight/insights.gateway.js';
import { FileSystemInsightsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/insights.fileSystem.js';
import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import type { StatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/stats.gateway.js';
import { ProjectStatsCalculator } from '@/modules/statistics-insights/interface-adapters/presenters/projectStats.calculator.js';
import type { SupervisorStatusStore } from '@/modules/supervisor-management/entities/supervisor/supervisorStatusStore.gateway.js';
import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import { FileSystemReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.js';
import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type { WorktreeHealthProbeGateway } from '@/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.js';
import type { WorktreeSizeProbeGateway } from '@/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.js';
import type { WorktreeSchedulerControls } from '@/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.js';
import { GitCommandCliGateway } from '@/modules/worktree-management/interface-adapters/gateways/gitCommand.cli.gateway.js';
import { WorktreeFileSystemGateway } from '@/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.js';
import { WorktreeHealthProbeFileSystemGateway } from '@/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.js';
import { WorktreeSizeProbeCliGateway } from '@/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.js';
import { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import { InMemoryForceCleanupLockService } from '@/modules/worktree-management/services/forceCleanupLock.js';
import type { ForceCleanupLockService } from '@/modules/worktree-management/services/forceCleanupLock.js';

import type { Config } from '../config/loader.js';
import { LOG_DIR, LOG_FILE_PATH } from '../shared/services/daemonPaths.js';

export interface Dependencies {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewLogFileGateway: ReviewLogFileGateway;
  reviewContextGateway: ReviewContextGateway;
  insightsGateway: InsightsGateway;
  reviewContextWatcher: ReviewContextWatcherService;
  progressPresenter: ReviewContextProgressPresenter;
  claudeInvocationDeps: ClaudeInvocationDeps;
  supervisorStatusStore: SupervisorStatusStore;
  gitCommandExecutor: GitCommandExecutor;
  worktreeGateway: WorktreeGateway;
  worktreeSizeProbeGateway: WorktreeSizeProbeGateway;
  worktreeHealthProbeGateway: WorktreeHealthProbeGateway;
  worktreePanelPresenter: WorktreePanelPresenter;
  sweepSchedulerControls: WorktreeSchedulerControls | null;
  forceCleanupLock: ForceCleanupLockService;
  logger: Logger;
  config: Config;
}

function createLoggerOptions(): LoggerOptions {
  const isDaemon = process.env.REVIEWFLOW_DAEMON === '1';

  if (isDaemon) {
    mkdirSync(LOG_DIR, { recursive: true });
    return {
      level: process.env.LOG_LEVEL || 'info',
    };
  }

  return {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  };
}

function createLogger(): Logger {
  const isDaemon = process.env.REVIEWFLOW_DAEMON === '1';
  const options = createLoggerOptions();

  if (isDaemon) {
    return pino(options, pino.destination(LOG_FILE_PATH));
  }

  return pino(options);
}

export function createDependencies(config: Config): Dependencies {
  const logger = createLogger();

  const reviewContextGateway = new ReviewContextFileSystemGateway();
  const gitCommandExecutor = new GitCommandCliGateway();
  const worktreeGateway = new WorktreeFileSystemGateway({ executor: gitCommandExecutor });
  const worktreeSizeProbeGateway = new WorktreeSizeProbeCliGateway();
  const worktreeHealthProbeGateway = new WorktreeHealthProbeFileSystemGateway({
    executor: gitCommandExecutor,
  });
  const worktreePanelPresenter = new WorktreePanelPresenter({
    sizeProbe: worktreeSizeProbeGateway,
  });
  const forceCleanupLock = new InMemoryForceCleanupLockService();

  return {
    reviewRequestTrackingGateway: new FileSystemReviewRequestTrackingGateway(
      new ProjectStatsCalculator(),
    ),
    statsGateway: new FileSystemStatsGateway(),
    reviewFileGateway: new FileSystemReviewFileGateway(),
    reviewLogFileGateway: new FileSystemReviewLogFileGateway(),
    reviewContextGateway,
    insightsGateway: new FileSystemInsightsGateway(),
    reviewContextWatcher: new ReviewContextWatcherService(reviewContextGateway),
    progressPresenter: new ReviewContextProgressPresenter(),
    claudeInvocationDeps: createDefaultClaudeInvocationDeps(),
    supervisorStatusStore: new InMemorySupervisorStatusStore(),
    gitCommandExecutor,
    worktreeGateway,
    worktreeSizeProbeGateway,
    worktreeHealthProbeGateway,
    worktreePanelPresenter,
    sweepSchedulerControls: null,
    forceCleanupLock,
    logger,
    config,
  };
}
