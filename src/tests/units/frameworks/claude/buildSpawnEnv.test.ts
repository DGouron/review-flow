import { describe, it, expect } from 'vitest';

import { buildSpawnEnv } from '@/frameworks/claude/claudeInvoker.js';

describe('buildSpawnEnv', () => {
  it('strips CLAUDECODE so a Claude-launched ReviewFlow does not leak its parent session marker', () => {
    const env = buildSpawnEnv({ PATH: '/usr/bin', CLAUDECODE: '1', HOME: '/root' });

    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/root');
  });

  it('forces TERM=dumb to prevent interactive prompts in the child', () => {
    const env = buildSpawnEnv({ TERM: 'xterm-256color' });

    expect(env.TERM).toBe('dumb');
  });

  it('forces CI=true to signal non-interactive mode to the child', () => {
    const env = buildSpawnEnv({});

    expect(env.CI).toBe('true');
  });

  it('lets explicit overrides win over scrubbed defaults', () => {
    const env = buildSpawnEnv({ TERM: 'xterm' }, { TERM: 'screen', EXTRA: 'value' });

    expect(env.TERM).toBe('screen');
    expect(env.EXTRA).toBe('value');
  });

  it('preserves unrelated process environment variables', () => {
    const env = buildSpawnEnv({ PATH: '/usr/bin', NODE_ENV: 'production', CUSTOM: 'x' });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.NODE_ENV).toBe('production');
    expect(env.CUSTOM).toBe('x');
  });
});
