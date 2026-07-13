import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ProjectConfigFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/projectConfig.fileSystem.gateway.js';

const BASE_CONFIG = {
  github: true,
  gitlab: false,
  defaultModel: 'sonnet' as const,
  reviewSkill: 'review-code',
  reviewFollowupSkill: 'review-followup',
  language: 'en' as const,
};

describe('ProjectConfigFileSystemGateway', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-projcfg-fs-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('returns false from exists() when file is absent', () => {
    const gateway = new ProjectConfigFileSystemGateway();
    expect(gateway.exists(rootDir)).toBe(false);
  });

  it('writes config under .claude/reviews/config.json', () => {
    const gateway = new ProjectConfigFileSystemGateway();
    gateway.write(rootDir, {
      ...BASE_CONFIG,
      agents: [{ name: 'clean-architecture', displayName: 'Clean Archi' }],
    });
    expect(existsSync(join(rootDir, '.claude', 'reviews', 'config.json'))).toBe(true);
  });

  it('reads back what it wrote', () => {
    const gateway = new ProjectConfigFileSystemGateway();
    const config = {
      ...BASE_CONFIG,
      gitlab: false,
      language: 'fr' as const,
      agents: [
        { name: 'testing', displayName: 'Testing' },
        { name: 'security', displayName: 'Security' },
      ],
    };
    gateway.write(rootDir, config);
    const reloaded = gateway.read(rootDir);
    expect(reloaded).toEqual(config);
  });

  it('reads back a config with no agents field (falls back to engine defaults)', () => {
    const gateway = new ProjectConfigFileSystemGateway();
    gateway.write(rootDir, BASE_CONFIG);
    expect(gateway.read(rootDir)).toEqual(BASE_CONFIG);
  });

  it('creates a .bak file when backup is requested on existing config', () => {
    const gateway = new ProjectConfigFileSystemGateway();
    gateway.write(rootDir, BASE_CONFIG);
    const backupPath = gateway.backup(rootDir);
    expect(backupPath).not.toBeNull();
    if (backupPath) {
      expect(existsSync(backupPath)).toBe(true);
      expect(readFileSync(backupPath, 'utf-8')).toContain('"reviewSkill"');
    }
  });

  it('returns null from backup when config is absent', () => {
    const gateway = new ProjectConfigFileSystemGateway();
    expect(gateway.backup(rootDir)).toBeNull();
  });
});
