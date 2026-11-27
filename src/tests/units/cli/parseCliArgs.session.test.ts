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

  it('reports an unknown session action as null', () => {
    const result = parseCliArgs(['session', 'explode']);

    expect(result).toEqual({ command: 'session', action: null });
  });
});
