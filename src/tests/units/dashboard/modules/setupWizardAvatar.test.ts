import { describe, it, expect } from 'vitest';

import {
  AVATAR_STATES,
  avatarStateFromEvents,
  shouldUseAvatar,
  avatarStateToVisual,
  projectVertex,
  WIREFRAME_VERTICES,
  WIREFRAME_EDGES,
} from '@/dashboard/modules/setupWizardAvatar.js';

describe('avatarStateFromEvents', () => {
  it('returns idle when no events have been received yet', () => {
    expect(avatarStateFromEvents([])).toBe('idle');
  });

  it('returns working when the latest step is in_progress', () => {
    const events = [{ step: 'dependencies', status: 'in_progress', message: 'Checking' }];
    expect(avatarStateFromEvents(events)).toBe('working');
  });

  it('returns success when the latest step succeeded', () => {
    const events = [
      { step: 'dependencies', status: 'in_progress', message: 'Checking' },
      { step: 'dependencies', status: 'succeeded', message: 'Done' },
    ];
    expect(avatarStateFromEvents(events)).toBe('success');
  });

  it('treats a skipped step as success (no error state)', () => {
    const events = [{ step: 'claude-login', status: 'skipped', message: 'Already logged in' }];
    expect(avatarStateFromEvents(events)).toBe('success');
  });

  it('returns error when the latest step is blocked', () => {
    const events = [
      {
        step: 'pipeline',
        status: 'blocked',
        message: 'Aucun remote git',
        remediation: 'Add a remote',
      },
    ];
    expect(avatarStateFromEvents(events)).toBe('error');
  });

  it('returns listening when the latest step awaits input', () => {
    const events = [
      {
        step: 'add-project',
        status: 'awaiting_input',
        prompt: 'Chemin ?',
        kind: 'choice',
        options: [],
        defaultValue: null,
      },
    ];
    expect(avatarStateFromEvents(events)).toBe('listening');
  });

  it('keeps working on a non-fatal warning', () => {
    const events = [
      { step: 'daemon', status: 'in_progress', message: 'Starting' },
      { step: 'warning', status: 'warning', message: 'Daemon already running' },
    ];
    expect(avatarStateFromEvents(events)).toBe('working');
  });

  it('returns celebrating on terminal completion', () => {
    const events = [
      { step: 'next-actions', status: 'succeeded', message: 'Done' },
      { step: 'done', status: 'completed', summary: {} },
    ];
    expect(avatarStateFromEvents(events)).toBe('celebrating');
  });

  it('ignores informational banner events when deriving the state', () => {
    const events = [
      { step: 'dependencies', status: 'in_progress', message: 'Checking' },
      { step: 'instructions', status: 'info', lines: ['Run claude login'] },
      { step: 'resume', status: 'resumed', resumeAt: 'add-project', position: 5, total: 10 },
    ];
    expect(avatarStateFromEvents(events)).toBe('working');
  });
});

describe('shouldUseAvatar', () => {
  it('uses the avatar when canvas is supported and reduced motion is off', () => {
    expect(shouldUseAvatar({ canvasSupported: true, reducedMotion: false })).toBe(true);
  });

  it('falls back when reduced motion is preferred', () => {
    expect(shouldUseAvatar({ canvasSupported: true, reducedMotion: true })).toBe(false);
  });

  it('falls back when canvas is not supported', () => {
    expect(shouldUseAvatar({ canvasSupported: false, reducedMotion: false })).toBe(false);
  });

  it('falls back when neither canvas nor motion is available', () => {
    expect(shouldUseAvatar({ canvasSupported: false, reducedMotion: true })).toBe(false);
  });
});

describe('avatarStateToVisual', () => {
  it('maps the error state to the danger colour token', () => {
    expect(avatarStateToVisual('error').color).toBe('--danger');
  });

  it('maps the success and celebrating states to the success colour token', () => {
    expect(avatarStateToVisual('success').color).toBe('--success');
    expect(avatarStateToVisual('celebrating').color).toBe('--success');
  });

  it('maps idle, working and listening to the accent colour token', () => {
    expect(avatarStateToVisual('idle').color).toBe('--accent');
    expect(avatarStateToVisual('working').color).toBe('--accent');
    expect(avatarStateToVisual('listening').color).toBe('--accent');
  });

  it('returns numeric line width, rotation speed and pulse for every state', () => {
    for (const state of AVATAR_STATES) {
      const visual = avatarStateToVisual(state);
      expect(typeof visual.lineWidth).toBe('number');
      expect(typeof visual.rotationSpeed).toBe('number');
      expect(typeof visual.pulse).toBe('number');
    }
  });

  it('rotates faster while working than while idle', () => {
    expect(avatarStateToVisual('working').rotationSpeed).toBeGreaterThan(
      avatarStateToVisual('idle').rotationSpeed,
    );
  });
});

describe('wireframe geometry', () => {
  it('describes an icosahedron with 12 vertices and 30 edges', () => {
    expect(WIREFRAME_VERTICES).toHaveLength(12);
    expect(WIREFRAME_EDGES).toHaveLength(30);
  });

  it('references only existing vertices in every edge', () => {
    for (const [from, to] of WIREFRAME_EDGES) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThan(WIREFRAME_VERTICES.length);
      expect(to).toBeLessThan(WIREFRAME_VERTICES.length);
    }
  });
});

describe('projectVertex', () => {
  const projection = { tilt: 0, distance: 4, scale: 100, centerX: 200, centerY: 150 };

  it('places a vertex at the canvas centre on its projected axes for the origin', () => {
    const point = projectVertex([0, 0, 0], 0, projection);
    expect(point.x).toBeCloseTo(200, 5);
    expect(point.y).toBeCloseTo(150, 5);
  });

  it('is deterministic for a known vertex at zero rotation', () => {
    const first = projectVertex([1, 0, 0], 0, projection);
    const second = projectVertex([1, 0, 0], 0, projection);
    expect(first).toEqual(second);
  });

  it('returns to the starting point after a full 2π rotation', () => {
    const start = projectVertex([1, 0.5, -0.5], 0, projection);
    const full = projectVertex([1, 0.5, -0.5], Math.PI * 2, projection);
    expect(full.x).toBeCloseTo(start.x, 5);
    expect(full.y).toBeCloseTo(start.y, 5);
  });

  it('moves the projected x of an off-centre vertex when it rotates', () => {
    const start = projectVertex([1, 0, 0], 0, projection);
    const quarter = projectVertex([1, 0, 0], Math.PI / 2, projection);
    expect(quarter.x).not.toBeCloseTo(start.x, 2);
  });
});
