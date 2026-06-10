import { describe, it, expect } from 'vitest';

import {
  EMBER_STATES,
  emberStateToVisual,
  buildFlameWireframe,
  projectFlameVertex,
  emberRadiusFactor,
  emberSwayOffset,
  FLAME_TIP_Y,
  FLAME_BASE_Y,
} from '@/dashboard/modules/emberAvatar.js';

describe('EMBER_STATES', () => {
  it('exposes exactly the three chat-driven states in narrative order', () => {
    expect(EMBER_STATES).toEqual(['idle', 'working', 'error']);
  });
});

describe('emberStateToVisual', () => {
  it('makes the working state lean, flicker and glow harder than idle', () => {
    const idle = emberStateToVisual('idle');
    const working = emberStateToVisual('working');
    expect(working.swayAmount).toBeGreaterThan(idle.swayAmount);
    expect(working.flicker).toBeGreaterThan(idle.flicker);
    expect(working.glow).toBeGreaterThan(idle.glow);
  });

  it('paints the error state with a distinct colour token from idle', () => {
    expect(emberStateToVisual('error').color).not.toBe(emberStateToVisual('idle').color);
  });
});

describe('buildFlameWireframe', () => {
  it('has one tip vertex plus a rings × meridians body', () => {
    const { vertices } = buildFlameWireframe({ rings: 6, meridians: 8 });
    expect(vertices).toHaveLength(1 + 6 * 8);
    expect(vertices[0]).toEqual([0, FLAME_TIP_Y, 0]);
    for (const vertex of vertices) {
      expect(vertex).toHaveLength(3);
    }
  });

  it('connects the tip, the meridians and the ring loops with edges', () => {
    const { edges } = buildFlameWireframe({ rings: 6, meridians: 8 });
    const tipSpokes = 8;
    const verticalLines = (6 - 1) * 8;
    const ringLoops = 6 * 8;
    expect(edges).toHaveLength(tipSpokes + verticalLines + ringLoops);
  });
});

describe('projectFlameVertex', () => {
  const projection = { tilt: 0.12, distance: 4, scale: 50, centerX: 120, centerY: 120 };

  it('is deterministic for the same inputs', () => {
    const vertex: [number, number, number] = [0.5, 0.2, -0.3];
    expect(projectFlameVertex(vertex, 1.1, 0.2, projection)).toEqual(
      projectFlameVertex(vertex, 1.1, 0.2, projection),
    );
  });

  it('leans the tip far more than the base for a positive sway', () => {
    const tip: [number, number, number] = [0, FLAME_TIP_Y, 0];
    const base: [number, number, number] = [0, FLAME_BASE_Y, 0];
    const tipShift =
      projectFlameVertex(tip, 0, 0.4, projection).x - projectFlameVertex(tip, 0, 0, projection).x;
    const baseShift =
      projectFlameVertex(base, 0, 0.4, projection).x - projectFlameVertex(base, 0, 0, projection).x;
    expect(tipShift).toBeGreaterThan(baseShift);
    expect(baseShift).toBeCloseTo(0, 6);
  });
});

describe('emberRadiusFactor', () => {
  it('returns the neutral factor of 1 at time 0', () => {
    expect(emberRadiusFactor(emberStateToVisual('idle'), 0)).toBeCloseTo(1, 5);
  });

  it('stays within the flicker envelope', () => {
    const visual = emberStateToVisual('working');
    for (const time of [120, 900, 1750, 5000]) {
      const factor = emberRadiusFactor(visual, time);
      expect(factor).toBeGreaterThanOrEqual(1 - visual.flicker - 1e-6);
      expect(factor).toBeLessThanOrEqual(1 + visual.flicker + 1e-6);
    }
  });
});

describe('emberSwayOffset', () => {
  it('is zero at time 0 and bounded by the sway amplitude', () => {
    const visual = emberStateToVisual('working');
    expect(emberSwayOffset(visual, 0)).toBeCloseTo(0, 6);
    for (const time of [200, 1234, 4321]) {
      expect(Math.abs(emberSwayOffset(visual, time))).toBeLessThanOrEqual(visual.swayAmount + 1e-6);
    }
  });
});
