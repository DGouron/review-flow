import { describe, it, expect } from 'vitest';

import { InMemorySupervisorHealthGateway } from '@/modules/claude-invocation/interface-adapters/gateways/supervisorHealth.memory.gateway.js';

describe('InMemorySupervisorHealthGateway', () => {
  it('starts in "up" status', () => {
    const gateway = new InMemorySupervisorHealthGateway();

    expect(gateway.read()).toEqual({
      status: 'up',
      lastCheckAt: null,
      lastDownReason: null,
    });
  });

  it('records the down reason when status flips to down', () => {
    const gateway = new InMemorySupervisorHealthGateway();

    gateway.update('down', 'socket missing', '2026-05-22T10:00:00Z');

    expect(gateway.read()).toEqual({
      status: 'down',
      lastCheckAt: '2026-05-22T10:00:00Z',
      lastDownReason: 'socket missing',
    });
  });

  it('clears the down reason when status flips back to up', () => {
    const gateway = new InMemorySupervisorHealthGateway();
    gateway.update('down', 'reason', '2026-05-22T10:00:00Z');

    gateway.update('up', null, '2026-05-22T10:01:00Z');

    expect(gateway.read()).toEqual({
      status: 'up',
      lastCheckAt: '2026-05-22T10:01:00Z',
      lastDownReason: null,
    });
  });
});
