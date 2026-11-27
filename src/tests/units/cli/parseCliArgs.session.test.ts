import { describe, expect, it } from 'vitest';

import { parseCliArgs } from '@/cli/parseCliArgs.js';

describe('parseCliArgs — session', () => {
  it('parses session launch with its role, brief and job', () => {
    const result = parseCliArgs([
      'session',
      'launch',
      '--role',
      'lot:bugs',
      '--brief',
      '/tmp/brief.md',
      '--job',
      'github:acme/app:2111',
    ]);

    expect(result).toEqual({
      command: 'session',
      action: 'launch',
      role: 'lot:bugs',
      brief: '/tmp/brief.md',
      job: 'github:acme/app:2111',
    });
  });

  it('leaves a missing option null', () => {
    const result = parseCliArgs(['session', 'launch', '--role', 'greffe']);

    expect(result).toEqual({
      command: 'session',
      action: 'launch',
      role: 'greffe',
      brief: null,
      job: null,
    });
  });

  it('parses session end with the session id', () => {
    expect(parseCliArgs(['session', 'end', 'a1b2c3d4'])).toEqual({
      command: 'session',
      action: 'end',
      sessionId: 'a1b2c3d4',
    });
  });

  it('leaves the session id of session end null when it is missing', () => {
    expect(parseCliArgs(['session', 'end'])).toEqual({
      command: 'session',
      action: 'end',
      sessionId: null,
    });
  });

  it('parses session sweep with and without --dry-run', () => {
    expect(parseCliArgs(['session', 'sweep'])).toEqual({
      command: 'session',
      action: 'sweep',
      dryRun: false,
    });
    expect(parseCliArgs(['session', 'sweep', '--dry-run'])).toEqual({
      command: 'session',
      action: 'sweep',
      dryRun: true,
    });
  });

  it('reports an unknown session action as null', () => {
    const result = parseCliArgs(['session', 'explode']);

    expect(result).toEqual({ command: 'session', action: null });
  });
});
