import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EnvFileFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/envFile.fileSystem.gateway.js';

describe('EnvFileFileSystemGateway', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-env-fs-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('reads null secrets when .env does not exist', () => {
    const gateway = new EnvFileFileSystemGateway();
    const result = gateway.read(rootDir);
    expect(result.gitlabSecret).toBeNull();
    expect(result.githubSecret).toBeNull();
  });

  it('writes and reads back webhook secrets', () => {
    const gateway = new EnvFileFileSystemGateway();
    gateway.write(rootDir, { gitlabSecret: 'a'.repeat(64), githubSecret: 'b'.repeat(64) });
    const result = gateway.read(rootDir);
    expect(result.gitlabSecret).toBe('a'.repeat(64));
    expect(result.githubSecret).toBe('b'.repeat(64));
  });

  it('creates .gitignore with .env entry when absent', () => {
    const gateway = new EnvFileFileSystemGateway();
    gateway.ensureGitignored(rootDir);
    const gitignore = readFileSync(join(rootDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.env');
  });

  it('does not duplicate .env entry when already present', () => {
    writeFileSync(join(rootDir, '.gitignore'), 'node_modules\n.env\n', 'utf-8');
    const gateway = new EnvFileFileSystemGateway();
    gateway.ensureGitignored(rootDir);
    const gitignore = readFileSync(join(rootDir, '.gitignore'), 'utf-8');
    const matches = gitignore.match(/\.env/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('appends .env entry to existing .gitignore that lacks it', () => {
    writeFileSync(join(rootDir, '.gitignore'), 'node_modules\n', 'utf-8');
    const gateway = new EnvFileFileSystemGateway();
    gateway.ensureGitignored(rootDir);
    const gitignore = readFileSync(join(rootDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.env');
    expect(existsSync(join(rootDir, '.gitignore'))).toBe(true);
  });
});
