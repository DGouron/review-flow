import { describe, it, expect } from 'vitest';

import { DaemonServiceSystemdGateway } from '@/modules/setup-wizard/interface-adapters/gateways/daemonService.systemd.gateway.js';
import { StubDaemonHealthProbeGateway } from '@/tests/stubs/setup-wizard/daemonHealthProbe.stub.js';

describe('DaemonServiceSystemdGateway', () => {
  it('returns unsupported-platform status on darwin', async () => {
    const gateway = new DaemonServiceSystemdGateway({
      healthProbe: new StubDaemonHealthProbeGateway(),
      port: 3847,
      platform: 'darwin',
    });
    const status = await gateway.status();
    expect(status.status).toBe('unsupported-platform');
  });

  it('reports active when systemctl returns "active"', async () => {
    const gateway = new DaemonServiceSystemdGateway({
      healthProbe: new StubDaemonHealthProbeGateway(),
      port: 3847,
      platform: 'linux',
      executeCommand: () => Buffer.from('active'),
    });
    const status = await gateway.status();
    expect(status.status).toBe('active');
  });

  it('reports not-installed when systemctl exits with error', async () => {
    const gateway = new DaemonServiceSystemdGateway({
      healthProbe: new StubDaemonHealthProbeGateway(),
      port: 3847,
      platform: 'linux',
      executeCommand: () => {
        throw new Error('Unit not found');
      },
    });
    const status = await gateway.status();
    expect(status.status).toBe('not-installed');
  });

  it('waitUntilHealthy returns true when probe is healthy', async () => {
    const gateway = new DaemonServiceSystemdGateway({
      healthProbe: new StubDaemonHealthProbeGateway({ healthy: true }),
      port: 3847,
      platform: 'linux',
      sleep: async () => undefined,
    });
    const healthy = await gateway.waitUntilHealthy(1000);
    expect(healthy).toBe(true);
  });

  it('waitUntilHealthy returns false on timeout', async () => {
    const gateway = new DaemonServiceSystemdGateway({
      healthProbe: new StubDaemonHealthProbeGateway({ healthy: false }),
      port: 3847,
      platform: 'linux',
      sleep: async () => undefined,
    });
    const healthy = await gateway.waitUntilHealthy(10);
    expect(healthy).toBe(false);
  });
});
