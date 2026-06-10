import { describe, it, expect } from 'vitest';

import {
  parseStreamMessage,
  appendEvent,
  shouldStartPolling,
  pollingStateToEvents,
  isRunComplete,
  buildMultiTabViewState,
  prefersReducedMotion,
} from '@/dashboard/modules/setupWizardStream.js';

describe('parseStreamMessage', () => {
  it('parses a valid wizard event from an SSE data payload', () => {
    const event = parseStreamMessage(
      '{"step":"dependencies","status":"in_progress","message":"x"}',
    );

    expect(event).not.toBeNull();
    expect(event?.step).toBe('dependencies');
  });

  it('returns null for a malformed payload', () => {
    expect(parseStreamMessage('not json')).toBeNull();
  });
});

describe('appendEvent', () => {
  it('appends a parsed event to the accumulator without mutating the input', () => {
    const initial = [{ step: 'dependencies', status: 'in_progress' }];

    const next = appendEvent(initial, { step: 'daemon', status: 'in_progress' });

    expect(next).toHaveLength(2);
    expect(initial).toHaveLength(1);
    expect(next[1].step).toBe('daemon');
  });
});

describe('shouldStartPolling', () => {
  it('starts polling when the stream is disconnected and the run is not complete', () => {
    expect(shouldStartPolling({ disconnected: true, complete: false })).toBe(true);
  });

  it('does not poll when the run is already complete', () => {
    expect(shouldStartPolling({ disconnected: true, complete: true })).toBe(false);
  });

  it('does not poll while the stream is connected', () => {
    expect(shouldStartPolling({ disconnected: false, complete: false })).toBe(false);
  });
});

describe('pollingStateToEvents', () => {
  it('returns no events when the polled state is null', () => {
    expect(pollingStateToEvents(null)).toEqual([]);
  });

  it('maps persisted terminal step outcomes into completion events', () => {
    const events = pollingStateToEvents({
      version: 1,
      startedAt: 'now',
      updatedAt: 'now',
      steps: {
        dependencies: { status: 'succeeded' },
        pipeline: { status: 'blocked', remediation: 'Add a git remote' },
      },
    });

    const dependencies = events.find((event) => event.step === 'dependencies');
    const pipeline = events.find((event) => event.step === 'pipeline');
    expect(dependencies?.status).toBe('succeeded');
    expect(pipeline?.status).toBe('blocked');
    expect(pipeline?.remediation).toBe('Add a git remote');
  });
});

describe('isRunComplete', () => {
  it('is complete when a done banner event is present', () => {
    expect(isRunComplete([{ step: 'done', status: 'completed', summary: {} }])).toBe(true);
  });

  it('is not complete without a done banner event', () => {
    expect(isRunComplete([{ step: 'dependencies', status: 'succeeded' }])).toBe(false);
  });
});

describe('buildMultiTabViewState', () => {
  it('marks the view read-only when another tab already owns the active run', () => {
    const state = buildMultiTabViewState({ isPrimaryTab: false, hasActiveRun: true });

    expect(state.readOnly).toBe(true);
    expect(state.notice).toContain('// SETUP DÉJÀ EN COURS');
  });

  it('is interactive for the primary tab', () => {
    const state = buildMultiTabViewState({ isPrimaryTab: true, hasActiveRun: true });

    expect(state.readOnly).toBe(false);
    expect(state.notice).toBeNull();
  });
});

describe('prefersReducedMotion', () => {
  it('reflects the media query match result', () => {
    expect(prefersReducedMotion({ matches: true })).toBe(true);
    expect(prefersReducedMotion({ matches: false })).toBe(false);
  });

  it('defaults to false when no media query is provided', () => {
    expect(prefersReducedMotion(null)).toBe(false);
  });
});
