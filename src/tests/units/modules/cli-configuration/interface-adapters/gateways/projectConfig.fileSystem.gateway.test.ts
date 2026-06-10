import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { ProjectConfigFileSystemGateway } from '@/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.js';

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    github: true,
    gitlab: false,
    defaultModel: 'sonnet',
    reviewSkill: 'review-front',
    reviewFollowupSkill: 'review-followup',
    language: 'en',
    retentionDays: 14,
    ...overrides,
  };
}

describe('ProjectConfigFileSystemGateway', () => {
  let workDirectory: string;

  beforeEach(() => {
    workDirectory = mkdtempSync(join(tmpdir(), 'spec-179-'));
  });

  afterEach(() => {
    rmSync(workDirectory, { recursive: true, force: true });
  });

  describe('read', () => {
    it('returns { status: "not-found" } when .claude/reviews/config.json is missing', () => {
      const gateway = new ProjectConfigFileSystemGateway();

      expect(gateway.read(workDirectory)).toEqual({ status: 'not-found' });
    });

    it('returns { status: "malformed" } when the file is not valid JSON', () => {
      mkdirSync(join(workDirectory, '.claude', 'reviews'), { recursive: true });
      writeFileSync(join(workDirectory, '.claude', 'reviews', 'config.json'), '{not json');
      const gateway = new ProjectConfigFileSystemGateway();

      expect(gateway.read(workDirectory)).toEqual({ status: 'malformed' });
    });

    it('returns { status: "ok", config } when the file is a valid ProjectConfig', () => {
      mkdirSync(join(workDirectory, '.claude', 'reviews'), { recursive: true });
      writeFileSync(
        join(workDirectory, '.claude', 'reviews', 'config.json'),
        JSON.stringify(baseConfig({ language: 'fr', externalLink: 'https://notion.so/x' })),
      );
      const gateway = new ProjectConfigFileSystemGateway();

      const result = gateway.read(workDirectory);

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.config.language).toBe('fr');
        expect(result.config.externalLink).toBe('https://notion.so/x');
      }
    });
  });

  describe('write', () => {
    it('writes the config atomically to .claude/reviews/config.json', () => {
      mkdirSync(join(workDirectory, '.claude', 'reviews'), { recursive: true });
      const gateway = new ProjectConfigFileSystemGateway();

      const result = gateway.write(workDirectory, baseConfig({ language: 'en' }));

      expect(result).toEqual({ ok: true });
      const content = readFileSync(
        join(workDirectory, '.claude', 'reviews', 'config.json'),
        'utf-8',
      );
      const parsed = JSON.parse(content);
      expect(parsed.language).toBe('en');
    });

    it('does not leave a half-written .tmp file when write succeeds', () => {
      mkdirSync(join(workDirectory, '.claude', 'reviews'), { recursive: true });
      const gateway = new ProjectConfigFileSystemGateway();

      gateway.write(workDirectory, baseConfig());

      expect(existsSync(join(workDirectory, '.claude', 'reviews', 'config.json.tmp'))).toBe(false);
    });

    it('returns { ok: false, reason } when the target directory does not exist', () => {
      const gateway = new ProjectConfigFileSystemGateway();

      const result = gateway.write('/nonexistent/path/does-not-exist', baseConfig());

      expect(result.ok).toBe(false);
    });
  });
});
