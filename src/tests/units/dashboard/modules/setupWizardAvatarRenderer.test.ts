import { describe, it, expect } from 'vitest';

import { mountSetupWizardAvatar } from '@/dashboard/modules/setupWizardAvatarRenderer.js';

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => null;
}

function fakeCanvas(): FakeCanvas {
  return { width: 220, height: 220, getContext: () => null };
}

describe('mountSetupWizardAvatar (lifecycle glue)', () => {
  it('schedules an animation frame on mount', () => {
    const requested: Array<(time: number) => void> = [];
    const canvas = fakeCanvas();

    mountSetupWizardAvatar({
      canvas,
      requestFrame: (callback) => {
        requested.push(callback);
        return requested.length;
      },
      cancelFrame: () => undefined,
      now: () => 0,
    });

    expect(requested).toHaveLength(1);
  });

  it('cancels the scheduled frame on destroy so the loop cannot leak', () => {
    const cancelled: number[] = [];
    const canvas = fakeCanvas();

    const controls = mountSetupWizardAvatar({
      canvas,
      requestFrame: () => 42,
      cancelFrame: (handle) => {
        cancelled.push(handle);
      },
      now: () => 0,
    });

    controls.destroy();

    expect(cancelled).toEqual([42]);
  });

  it('exposes setState and destroy controls', () => {
    const canvas = fakeCanvas();

    const controls = mountSetupWizardAvatar({
      canvas,
      requestFrame: () => 1,
      cancelFrame: () => undefined,
      now: () => 0,
    });

    expect(typeof controls.setState).toBe('function');
    expect(typeof controls.destroy).toBe('function');
  });
});
