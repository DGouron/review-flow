import { describe, it, expect } from 'vitest';

import { InMemoryIdempotencyStore } from '@/modules/platform-integration/interface-adapters/gateways/inMemoryIdempotencyStore.gateway.js';

function createClock(start: number): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('InMemoryIdempotencyStore', () => {
  it('records a new key as absent (returns true on first call)', async () => {
    const store = new InMemoryIdempotencyStore({ ttlMs: 1000, clock: () => 0 });

    const firstResult = await store.recordIfAbsent('event-1');

    expect(firstResult).toBe(true);
  });

  it('reports an already-present key (returns false on immediate second call)', async () => {
    const store = new InMemoryIdempotencyStore({ ttlMs: 1000, clock: () => 0 });

    await store.recordIfAbsent('event-1');
    const secondResult = await store.recordIfAbsent('event-1');

    expect(secondResult).toBe(false);
  });

  it('treats distinct keys independently', async () => {
    const store = new InMemoryIdempotencyStore({ ttlMs: 1000, clock: () => 0 });

    const first = await store.recordIfAbsent('event-1');
    const second = await store.recordIfAbsent('event-2');

    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('keeps a key blocked while still within the TTL window', async () => {
    const clock = createClock(0);
    const store = new InMemoryIdempotencyStore({ ttlMs: 1000, clock: clock.now });

    await store.recordIfAbsent('event-1');
    clock.advance(999);
    const withinWindow = await store.recordIfAbsent('event-1');

    expect(withinWindow).toBe(false);
  });

  it('re-accepts a key after the TTL window elapses', async () => {
    const clock = createClock(0);
    const store = new InMemoryIdempotencyStore({ ttlMs: 1000, clock: clock.now });

    await store.recordIfAbsent('event-1');
    clock.advance(1001);
    const afterWindow = await store.recordIfAbsent('event-1');

    expect(afterWindow).toBe(true);
  });
});
