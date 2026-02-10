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
import { pino, type Logger } from 'pino';

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

export function createDependencies(config: Config): Dependencies {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });

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
