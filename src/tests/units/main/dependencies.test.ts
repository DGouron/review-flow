import { describe, it, expect } from 'vitest';
import { createDependencies } from '../../../main/dependencies.js';
import { createTestConfig } from '../../factories/config.factory.js';
import { ReviewContextWatcherService } from '../../../services/reviewContextWatcher.service.js';
import { ReviewContextProgressPresenter } from '../../../interface-adapters/presenters/reviewContextProgress.presenter.js';

describe('createDependencies', () => {
  it('should create all gateways from config', () => {
    const config = createTestConfig();

    const deps = createDependencies(config);

    expect(deps.reviewRequestTrackingGateway).toBeDefined();
    expect(deps.statsGateway).toBeDefined();
    expect(deps.reviewFileGateway).toBeDefined();
    expect(deps.logger).toBeDefined();
  });

  it('should include config in dependencies', () => {
    const config = createTestConfig({ server: { port: 4000 } });

    const deps = createDependencies(config);

    expect(deps.config).toBe(config);
    expect(deps.config.server.port).toBe(4000);
  });

  it('should create reviewContextGateway', () => {
    const config = createTestConfig();

    const deps = createDependencies(config);

    expect(deps.reviewContextGateway).toBeDefined();
    expect(deps.reviewContextGateway.read).toBeTypeOf('function');
    expect(deps.reviewContextGateway.exists).toBeTypeOf('function');
  });

  it('should create reviewContextWatcher with gateway injected', () => {
    const config = createTestConfig();

    const deps = createDependencies(config);

    expect(deps.reviewContextWatcher).toBeDefined();
    expect(deps.reviewContextWatcher).toBeInstanceOf(ReviewContextWatcherService);
    expect(deps.reviewContextWatcher.isWatching).toBeTypeOf('function');
  });

  it('should create progressPresenter', () => {
    const config = createTestConfig();

    const deps = createDependencies(config);

    expect(deps.progressPresenter).toBeDefined();
    expect(deps.progressPresenter).toBeInstanceOf(ReviewContextProgressPresenter);
    expect(deps.progressPresenter.toReviewProgress).toBeTypeOf('function');
  });
});
