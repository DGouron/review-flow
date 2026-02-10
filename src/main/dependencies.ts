import type { Config } from '../config/loader.js';
import type { ReviewRequestTrackingGateway } from '../interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { StatsGateway } from '../interface-adapters/gateways/stats.gateway.js';
import type { ReviewFileGateway } from '../interface-adapters/gateways/reviewFile.gateway.js';
import type { ReviewContextGateway } from '../entities/reviewContext/reviewContext.gateway.js';
import { FileSystemReviewRequestTrackingGateway } from '../interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.js';
import { FileSystemStatsGateway } from '../interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { FileSystemReviewFileGateway } from '../interface-adapters/gateways/fileSystem/reviewFile.fileSystem.js';
import { ReviewContextFileSystemGateway } from '../interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import { ReviewContextWatcherService } from '../services/reviewContextWatcher.service.js';
import { ReviewContextProgressPresenter } from '../interface-adapters/presenters/reviewContextProgress.presenter.js';
import { ProjectStatsCalculator } from '../interface-adapters/presenters/projectStats.calculator.js';
import { pino, type Logger, type LoggerOptions } from 'pino';
import { mkdirSync } from 'node:fs';
import { LOG_DIR, LOG_FILE_PATH } from '../shared/services/daemonPaths.js';

export interface Dependencies {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewContextGateway: ReviewContextGateway;
  reviewContextWatcher: ReviewContextWatcherService;
  progressPresenter: ReviewContextProgressPresenter;
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
    transport: process.env.NODE_ENV !== 'production'
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

  return {
    reviewRequestTrackingGateway: new FileSystemReviewRequestTrackingGateway(new ProjectStatsCalculator()),
    statsGateway: new FileSystemStatsGateway(),
    reviewFileGateway: new FileSystemReviewFileGateway(),
    reviewContextGateway,
    reviewContextWatcher: new ReviewContextWatcherService(reviewContextGateway),
    progressPresenter: new ReviewContextProgressPresenter(),
    logger,
    config,
  };
}
