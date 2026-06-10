import { describe, it, expect } from 'vitest';

import { createSupervisorStatus } from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';
import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';

describe('InMemorySupervisorStatusStore', () => {
  it('starts with state unknown and a null reason', () => {
    const store = new InMemorySupervisorStatusStore();

    const initial = store.read();

    expect(initial.state).toBe('unknown');
    expect(initial.reason).toBeNull();
  });

  it('stores the latest status set', () => {
    const store = new InMemorySupervisorStatusStore();
    const next = createSupervisorStatus('up', null, new Date('2026-05-23T08:00:00Z'));

    store.set(next);

    expect(store.read().state).toBe('up');
    expect(store.read().lastCheckedAt.toISOString()).toBe('2026-05-23T08:00:00.000Z');
  });

  it('returns a defensive copy so external mutation does not leak', () => {
    const store = new InMemorySupervisorStatusStore();
    store.set(createSupervisorStatus('down', 'boom', new Date('2026-05-23T08:00:00Z')));

    const snapshot = store.read();
    snapshot.state = 'up';

    expect(store.read().state).toBe('down');
  });
});
