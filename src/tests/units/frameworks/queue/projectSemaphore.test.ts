import { describe, expect, it } from 'vitest';

import { ProjectSemaphore } from '@/frameworks/queue/projectSemaphore.js';

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('ProjectSemaphore', () => {
  it('uses default capacity 2 when no explicit cap is set', async () => {
    const semaphore = new ProjectSemaphore();

    await semaphore.acquire('/proj/A');
    await semaphore.acquire('/proj/A');

    expect(semaphore.runningCount('/proj/A')).toBe(2);

    let thirdResolved = false;
    (async () => {
      await semaphore.acquire('/proj/A');
      thirdResolved = true;
    })();
    await flushMicrotasks();
    expect(thirdResolved).toBe(false);
  });

  it('acquire resolves immediately when running < capacity', async () => {
    const semaphore = new ProjectSemaphore();
    semaphore.setCapacity('/proj/A', 3);

    const first = await semaphore.acquire('/proj/A');
    const second = await semaphore.acquire('/proj/A');
    const third = await semaphore.acquire('/proj/A');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(third).toBe(true);
    expect(semaphore.runningCount('/proj/A')).toBe(3);
  });

  it('acquire blocks (pending) once capacity is reached and resolves on release in FIFO order', async () => {
    const semaphore = new ProjectSemaphore();
    semaphore.setCapacity('/proj/A', 1);

    await semaphore.acquire('/proj/A');

    const log: string[] = [];
    const w1 = (async () => {
      await semaphore.acquire('/proj/A');
      log.push('w1');
    })();
    const w2 = (async () => {
      await semaphore.acquire('/proj/A');
      log.push('w2');
    })();

    await flushMicrotasks();
    expect(log).toEqual([]);
    expect(semaphore.pendingCount('/proj/A')).toBe(2);

    semaphore.release('/proj/A');
    await flushMicrotasks();
    expect(log).toEqual(['w1']);

    semaphore.release('/proj/A');
    await flushMicrotasks();
    expect(log).toEqual(['w1', 'w2']);

    await w1;
    await w2;
  });

  it('lowering the cap does NOT interrupt running acquisitions', async () => {
    const semaphore = new ProjectSemaphore();
    semaphore.setCapacity('/proj/A', 4);
    await semaphore.acquire('/proj/A');
    await semaphore.acquire('/proj/A');
    await semaphore.acquire('/proj/A');
    await semaphore.acquire('/proj/A');

    semaphore.setCapacity('/proj/A', 2);

    expect(semaphore.runningCount('/proj/A')).toBe(4);
  });

  it('raising the cap immediately drains pending waiters up to the new cap', async () => {
    const semaphore = new ProjectSemaphore();
    semaphore.setCapacity('/proj/A', 2);
    await semaphore.acquire('/proj/A');
    await semaphore.acquire('/proj/A');

    const counter = { released: 0 };
    const acquireAndCount = async (): Promise<void> => {
      await semaphore.acquire('/proj/A');
      counter.released += 1;
    };
    acquireAndCount();
    acquireAndCount();
    acquireAndCount();

    await flushMicrotasks();
    expect(counter.released).toBe(0);

    semaphore.setCapacity('/proj/A', 4);
    await flushMicrotasks();

    expect(counter.released).toBe(2);
    expect(semaphore.pendingCount('/proj/A')).toBe(1);
  });

  it('isolates per-key state (separate counts, separate caps)', async () => {
    const semaphore = new ProjectSemaphore();
    semaphore.setCapacity('/proj/A', 1);
    semaphore.setCapacity('/proj/B', 2);

    await semaphore.acquire('/proj/A');
    await semaphore.acquire('/proj/B');
    await semaphore.acquire('/proj/B');

    expect(semaphore.runningCount('/proj/A')).toBe(1);
    expect(semaphore.runningCount('/proj/B')).toBe(2);
    expect(semaphore.totalRunning()).toBe(3);
  });

  it('release without prior acquire is a no-op (does not go negative)', () => {
    const semaphore = new ProjectSemaphore();
    semaphore.setCapacity('/proj/A', 1);
    semaphore.release('/proj/A');

    expect(semaphore.runningCount('/proj/A')).toBe(0);
  });
});
