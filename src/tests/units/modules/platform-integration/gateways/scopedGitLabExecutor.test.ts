import { describe, it, expect } from 'vitest';

import { createScopedGitLabExecutor } from '@/modules/platform-integration/interface-adapters/gateways/scopedGitLabExecutor.js';
import { MissingExecutorTokenError } from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';

const TOKEN = 'glpat-scoped-exec-1';

class RecordingFileWriter {
  public readonly writes: Array<{ path: string; contents: string }> = [];
  public readonly ensuredDirs: string[] = [];
  write(path: string, contents: string): void {
    this.writes.push({ path, contents });
  }
  ensureDir(path: string): void {
    this.ensuredDirs.push(path);
  }
}

class RecordingSpawn {
  public readonly calls: Array<{
    command: string;
    env: Record<string, string | undefined>;
    cwd: string;
  }> = [];
  run = (command: string, env: Record<string, string | undefined>, cwd: string): string => {
    this.calls.push({ command, env, cwd });
    return '[]';
  };
}

describe('scoped gitlab executor factory (AC1-AC4 wiring)', () => {
  it('AC1: throws fail-closed when the service token is absent, never spawning', () => {
    const spawn = new RecordingSpawn();
    const fileWriter = new RecordingFileWriter();
    expect(() =>
      createScopedGitLabExecutor({
        parentEnv: { PATH: '/usr/bin' },
        isolatedDir: '/tmp/iso',
        fileWriter,
        spawn: spawn.run,
      }),
    ).toThrow(MissingExecutorTokenError);
    expect(spawn.calls).toHaveLength(0);
    expect(fileWriter.writes).toHaveLength(0);
  });

  it('AC1: returns a callable executor when the token is present', () => {
    const spawn = new RecordingSpawn();
    const fileWriter = new RecordingFileWriter();
    const executor = createScopedGitLabExecutor({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: '/tmp/iso',
      fileWriter,
      spawn: spawn.run,
    });
    expect(typeof executor).toBe('function');
  });

  it('AC3: the spawned env never carries the token value', () => {
    const spawn = new RecordingSpawn();
    const fileWriter = new RecordingFileWriter();
    const executor = createScopedGitLabExecutor({
      parentEnv: {
        REVIEWFLOW_EXECUTOR_TOKEN: TOKEN,
        PATH: '/usr/bin',
        AMBIENT_ADMIN_TOKEN: 'canary',
      },
      isolatedDir: '/tmp/iso',
      fileWriter,
      spawn: spawn.run,
    });
    executor('glab api projects/x/merge_requests/1/discussions');
    expect(spawn.calls).toHaveLength(1);
    const firstCall = spawn.calls[0];
    if (!firstCall) throw new Error('expected one spawn call');
    for (const value of Object.values(firstCall.env)) {
      expect(value).not.toBe(TOKEN);
    }
    expect(firstCall.env.AMBIENT_ADMIN_TOKEN).toBeUndefined();
  });

  it('AC4: spawns with HOME and GLAB_CONFIG_DIR under the isolated dir', () => {
    const spawn = new RecordingSpawn();
    const fileWriter = new RecordingFileWriter();
    const executor = createScopedGitLabExecutor({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: '/tmp/iso',
      fileWriter,
      spawn: spawn.run,
    });
    executor('glab api projects/x/merge_requests/1/discussions');
    expect(spawn.calls[0]?.env.HOME?.startsWith('/tmp/iso')).toBe(true);
    expect(spawn.calls[0]?.env.GLAB_CONFIG_DIR?.startsWith('/tmp/iso')).toBe(true);
  });

  it('AC4: writes the token only into the isolated glab config file', () => {
    const spawn = new RecordingSpawn();
    const fileWriter = new RecordingFileWriter();
    createScopedGitLabExecutor({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: '/tmp/iso',
      fileWriter,
      spawn: spawn.run,
    });
    expect(fileWriter.writes).toHaveLength(1);
    expect(fileWriter.writes[0]?.path.startsWith('/tmp/iso')).toBe(true);
    expect(fileWriter.writes[0]?.contents).toContain(TOKEN);
  });
});
