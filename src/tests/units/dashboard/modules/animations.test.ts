/**
 * animations.test.ts — Smoke tests for the animations helper module.
 *
 * The module is a browser-side JS file using window.matchMedia and DOM APIs.
 * Tests focus on the exportable contracts without requiring a real DOM:
 * - All expected functions are exported
 * - reducedMotion() returns a boolean given a mocked matchMedia
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const globalAny = globalThis as unknown as Record<string, unknown>;

describe('animations module — export contracts', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = globalAny.window;
    // Provide minimal window stub so the module can import
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: false }) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('exports reducedMotion as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.reducedMotion).toBe('function');
  });

  it('exports animateMount as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.animateMount).toBe('function');
  });

  it('exports animateCounter as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.animateCounter).toBe('function');
  });

  it('exports slideTabUnderline as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.slideTabUnderline).toBe('function');
  });

  it('exports heartbeat as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.heartbeat).toBe('function');
  });

  it('exports pulseLive as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.pulseLive).toBe('function');
  });

  it('exports springIn as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.springIn).toBe('function');
  });

  it('exports liftCard as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.liftCard).toBe('function');
  });

  it('exports unliftCard as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.unliftCard).toBe('function');
  });

  it('exports pulseStatusDot as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.pulseStatusDot).toBe('function');
  });

  it('exports breatheLogo as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.breatheLogo).toBe('function');
  });

  it('exports crossFadeTab as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.crossFadeTab).toBe('function');
  });

  it('exports reviewCompleted as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.reviewCompleted).toBe('function');
  });

  it('reducedMotion returns false when matchMedia matches is false', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: false }) },
      writable: true,
      configurable: true,
    });
    const { reducedMotion } = await import('@/dashboard/modules/animations.js');
    expect(reducedMotion()).toBe(false);
  });

  it('reducedMotion returns true when matchMedia matches is true', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: true }) },
      writable: true,
      configurable: true,
    });
    const { reducedMotion } = await import('@/dashboard/modules/animations.js');
    expect(reducedMotion()).toBe(true);
  });
});

describe('animations module — behavioral tests', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = globalAny.window;
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: false }) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('animateCounter with reduced-motion writes target value synchronously, no animeApi call', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: true }) },
      writable: true,
      configurable: true,
    });
    const { animateCounter } = await import('@/dashboard/modules/animations.js');
    const element = { textContent: '' } as { textContent: string };
    const animeApi = { animate: vi.fn() };
    animateCounter(element as Parameters<typeof animateCounter>[0], 0, 42, { animeApi });
    expect(element.textContent).toBe('42');
    expect(animeApi.animate).not.toHaveBeenCalled();
  });

  it('animateCounter passes onComplete to animeApi.animate (regression for counter-loop guard)', async () => {
    const { animateCounter } = await import('@/dashboard/modules/animations.js');
    const element = { textContent: '0' } as { textContent: string };
    const calls: Array<{ params: Record<string, unknown> }> = [];
    const animeApi = {
      animate: (_target: unknown, params: Record<string, unknown>) => {
        calls.push({ params });
      },
    };
    let onCompleteFired = false;
    animateCounter(element as Parameters<typeof animateCounter>[0], 0, 5, {
      animeApi,
      onComplete: () => {
        onCompleteFired = true;
      },
    });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const tween = calls[0].params as { onComplete?: () => void };
    expect(typeof tween.onComplete).toBe('function');
    tween.onComplete?.();
    expect(onCompleteFired).toBe(true);
    expect(element.textContent).toBe('5');
  });

  it('expandHeight with reduced-motion sets height to auto and skips animation', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: true }) },
      writable: true,
      configurable: true,
    });
    const { expandHeight } = await import('@/dashboard/modules/animations.js');
    const fakeEl = {
      style: { height: '', overflow: '' },
      getBoundingClientRect: () => ({ height: 200 }),
      offsetHeight: 0,
    };
    const animeApi = { animate: vi.fn() };
    expandHeight(fakeEl as Parameters<typeof expandHeight>[0], { animeApi });
    expect(fakeEl.style.height).toBe('auto');
    expect(fakeEl.style.overflow).toBe('');
    expect(animeApi.animate).not.toHaveBeenCalled();
  });

  it('collapseHeight with reduced-motion sets height to 0 and skips animation', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: true }) },
      writable: true,
      configurable: true,
    });
    const { collapseHeight } = await import('@/dashboard/modules/animations.js');
    const fakeEl = {
      style: { height: '', overflow: '' },
      getBoundingClientRect: () => ({ height: 200 }),
      offsetHeight: 200,
    };
    const animeApi = { animate: vi.fn() };
    collapseHeight(fakeEl as Parameters<typeof collapseHeight>[0], { animeApi });
    expect(fakeEl.style.height).toBe('0px');
    expect(animeApi.animate).not.toHaveBeenCalled();
  });

  it('expandHeight forces a reflow before animating (no flash regression)', async () => {
    const { expandHeight } = await import('@/dashboard/modules/animations.js');
    let offsetHeightReads = 0;
    const element = {
      style: { height: '', overflow: '' },
      getBoundingClientRect: () => ({ height: 200 }) as unknown,
      get offsetHeight() {
        offsetHeightReads += 1;
        return 0;
      },
    };
    const animeApi = { animate: vi.fn() };
    expandHeight(element as never, { animeApi });
    expect(offsetHeightReads).toBeGreaterThanOrEqual(1);
    expect(animeApi.animate).toHaveBeenCalledTimes(1);
  });

  it('reducedMotion returns true when matchMedia matches', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: true }) },
      writable: true,
      configurable: true,
    });
    const { reducedMotion } = await import('@/dashboard/modules/animations.js');
    expect(reducedMotion()).toBe(true);
  });

  it('reducedMotion returns false when matchMedia does not match', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: false }) },
      writable: true,
      configurable: true,
    });
    const { reducedMotion } = await import('@/dashboard/modules/animations.js');
    expect(reducedMotion()).toBe(false);
  });
});
