import { describe, it, expect } from 'vitest';
import { createDependencies } from '../../../main/dependencies.js';
import { createTestConfig } from '../../factories/config.factory.js';

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
});
