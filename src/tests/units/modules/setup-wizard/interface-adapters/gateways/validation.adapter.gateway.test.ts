import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ValidationAdapterGateway } from '@/modules/setup-wizard/interface-adapters/gateways/validation.adapter.gateway.js';

const VALID_CONFIG = {
  server: { port: 3000 },
  user: { name: 'reviewer' },
  queue: { concurrency: 1 },
};

// Shape written by GenerateFilesStep into every configured project's
// .claude/reviews/config.json — deliberately has no server/user/queue section.
const REAL_PROJECT_REVIEW_CONFIG = {
  github: true,
  gitlab: false,
  defaultModel: 'sonnet',
  reviewSkill: 'review-code',
  reviewFollowupSkill: 'review-followup',
};

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value));
}

describe('ValidationAdapterGateway (integration with real filesystem)', () => {
  let rootDir: string;
  let projectPath: string;
  let configPath: string;
  let envPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-validation-adapter-'));
    projectPath = join(rootDir, 'project');
    mkdirSync(projectPath, { recursive: true });
    configPath = join(rootDir, 'config.json');
    envPath = join(rootDir, '.env');
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('validates the global CLI config regardless of the project path', () => {
    writeJson(configPath, VALID_CONFIG);
    writeFileSync(envPath, 'TOKEN=value\n');

    const gateway = new ValidationAdapterGateway({ configPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('valid');
    expect(report.issues).toEqual([]);
  });

  it('does not mistake a per-project .claude/reviews/config.json for the global config', () => {
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    writeJson(join(projectPath, '.claude', 'reviews', 'config.json'), REAL_PROJECT_REVIEW_CONFIG);
    writeJson(configPath, VALID_CONFIG);
    writeFileSync(envPath, 'TOKEN=value\n');

    const gateway = new ValidationAdapterGateway({ configPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('valid');
    expect(report.issues).toEqual([]);
  });

  it('reports not-found when the global config does not exist', () => {
    const gateway = new ValidationAdapterGateway({ configPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('not-found');
    expect(report.issues).toEqual([]);
  });

  it('maps each validation issue field, message and severity', () => {
    writeJson(configPath, { server: { port: 70000 } });

    const gateway = new ValidationAdapterGateway({ configPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('invalid');
    expect(report.issues).toContainEqual({
      field: 'server.port',
      message: 'Port must be between 1 and 65535',
      severity: 'error',
    });
    expect(report.issues).toContainEqual({
      field: '.env',
      message: 'Missing .env file',
      severity: 'error',
    });
  });
});
