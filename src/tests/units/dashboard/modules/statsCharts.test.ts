import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { animateCounter } from '@/dashboard/modules/statsCharts.js';

/**
 * animateCounter relies on requestAnimationFrame and performance.now which
 * aren't part of the Node runtime. Synchronous stubs drive the animation loop
 * to completion within a single tick: each call advances the fake clock past
 * the requested duration so progress reaches 1 immediately.
 */
type RafCallback = (timestamp: number) => void;

const globalRecord = globalThis as Record<string, unknown>;
let originalRaf: unknown;
let originalPerformance: unknown;
let fakeTime = 0;

beforeEach(() => {
  originalRaf = globalRecord.requestAnimationFrame;
  originalPerformance = globalRecord.performance;
  fakeTime = 0;
  globalRecord.requestAnimationFrame = (callback: RafCallback) => {
    fakeTime += 1000;
    callback(fakeTime);
    return 0;
  };
  globalRecord.performance = { now: () => fakeTime };
});

afterEach(() => {
  globalRecord.requestAnimationFrame = originalRaf;
  globalRecord.performance = originalPerformance;
});

describe('animateCounter', () => {
  it('eventually sets the textContent to the target value with the suffix', () => {
    const element = { textContent: '' };
    animateCounter(element as unknown as { textContent: string }, 100, 50, ' pts');
    expect(element.textContent).toBe('100 pts');
  });

  it('handles a zero target value', () => {
    const element = { textContent: 'placeholder' };
    animateCounter(element as unknown as { textContent: string }, 0, 50, '');
    expect(element.textContent).toBe('0');
  });
});
