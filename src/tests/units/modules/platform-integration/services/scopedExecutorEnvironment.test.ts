import { describe, it, expect } from 'vitest';

import {
  buildScopedExecutorEnvironment,
  ENV_ALLOWLIST,
  MissingExecutorTokenError,
} from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';

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

const TOKEN = 'glpat-service-token-xyz';
const TEMP_ROOT = '/tmp/reviewflow-executor-abc123';

describe('scoped executor environment (AC1/AC2/AC3/AC4)', () => {
  it('AC1: throws fail-closed when the service token is absent', () => {
    const fileWriter = new RecordingFileWriter();
    expect(() =>
      buildScopedExecutorEnvironment({
        parentEnv: { PATH: '/usr/bin' },
        isolatedDir: TEMP_ROOT,
        fileWriter,
      }),
    ).toThrow(MissingExecutorTokenError);
    expect(fileWriter.writes).toHaveLength(0);
  });

  it('AC1: throws fail-closed when the service token is empty', () => {
    const fileWriter = new RecordingFileWriter();
    expect(() =>
      buildScopedExecutorEnvironment({
        parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: '   ' },
        isolatedDir: TEMP_ROOT,
        fileWriter,
      }),
    ).toThrow(MissingExecutorTokenError);
    expect(fileWriter.writes).toHaveLength(0);
  });

  it('AC1: returns a configured environment when the token is present', () => {
    const fileWriter = new RecordingFileWriter();
    const result = buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    expect(result.env).toBeDefined();
    expect(fileWriter.writes).toHaveLength(1);
  });

  it('AC2: child env keyset is a subset of the declared allowlist', () => {
    const fileWriter = new RecordingFileWriter();
    const { env } = buildScopedExecutorEnvironment({
      parentEnv: {
        REVIEWFLOW_EXECUTOR_TOKEN: TOKEN,
        PATH: '/usr/bin',
        LANG: 'en_US.UTF-8',
        AMBIENT_ADMIN_TOKEN: 'canary',
      },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    for (const key of Object.keys(env)) {
      expect(ENV_ALLOWLIST).toContain(key);
    }
  });

  it('AC2: a parent canary secret is absent from the child env', () => {
    const fileWriter = new RecordingFileWriter();
    const { env } = buildScopedExecutorEnvironment({
      parentEnv: {
        REVIEWFLOW_EXECUTOR_TOKEN: TOKEN,
        PATH: '/usr/bin',
        AMBIENT_ADMIN_TOKEN: 'canary',
      },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    expect('AMBIENT_ADMIN_TOKEN' in env).toBe(false);
  });

  it('AC3: no child env value equals the token string', () => {
    const fileWriter = new RecordingFileWriter();
    const { env } = buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    for (const value of Object.values(env)) {
      expect(value).not.toBe(TOKEN);
    }
  });

  it('AC3: the token appears only in the rendered config-file contents', () => {
    const fileWriter = new RecordingFileWriter();
    buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    expect(fileWriter.writes[0]?.contents).toContain(TOKEN);
  });

  it('AC4: HOME and GLAB_CONFIG_DIR resolve under the isolated temp root', () => {
    const fileWriter = new RecordingFileWriter();
    const { env } = buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    expect(env.HOME?.startsWith(TEMP_ROOT)).toBe(true);
    expect(env.GLAB_CONFIG_DIR?.startsWith(TEMP_ROOT)).toBe(true);
  });

  it('AC4: the config file is written at GLAB_CONFIG_DIR/config.yml (glab ignores a glab-cli subdir when GLAB_CONFIG_DIR is set)', () => {
    const fileWriter = new RecordingFileWriter();
    const { env } = buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    expect(fileWriter.writes[0]?.path).toBe(`${env.GLAB_CONFIG_DIR}/config.yml`);
  });

  it('AC4: every written path stays under the isolated temp root', () => {
    const fileWriter = new RecordingFileWriter();
    buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    for (const write of fileWriter.writes) {
      expect(write.path.startsWith(TEMP_ROOT)).toBe(true);
    }
  });

  it('AC4: creates the isolated HOME directory so the spawn cwd exists', () => {
    const fileWriter = new RecordingFileWriter();
    const { env } = buildScopedExecutorEnvironment({
      parentEnv: { REVIEWFLOW_EXECUTOR_TOKEN: TOKEN, PATH: '/usr/bin' },
      isolatedDir: TEMP_ROOT,
      fileWriter,
    });
    expect(fileWriter.ensuredDirs).toContain(env.HOME);
  });
});
