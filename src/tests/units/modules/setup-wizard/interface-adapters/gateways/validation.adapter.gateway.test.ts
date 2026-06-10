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

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value));
}

describe('ValidationAdapterGateway (integration with real filesystem)', () => {
  let rootDir: string;
  let projectPath: string;
  let fallbackConfigPath: string;
  let envPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-validation-adapter-'));
    projectPath = join(rootDir, 'project');
    mkdirSync(projectPath, { recursive: true });
    fallbackConfigPath = join(rootDir, 'fallback-config.json');
    envPath = join(rootDir, '.env');
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('reports valid when the project config and env file are present and correct', () => {
    const projectConfigPath = join(projectPath, '.claude', 'reviews', 'config.json');
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    writeJson(projectConfigPath, VALID_CONFIG);
    writeFileSync(envPath, 'TOKEN=value\n');

    const gateway = new ValidationAdapterGateway({ configPath: fallbackConfigPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('valid');
    expect(report.issues).toEqual([]);
  });

  it('falls back to the dependency config path when the project config is absent', () => {
    writeJson(fallbackConfigPath, VALID_CONFIG);
    writeFileSync(envPath, 'TOKEN=value\n');

    const gateway = new ValidationAdapterGateway({ configPath: fallbackConfigPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('valid');
    expect(report.issues).toEqual([]);
  });

  it('reports not-found when neither project nor fallback config exists', () => {
    const gateway = new ValidationAdapterGateway({ configPath: fallbackConfigPath, envPath });
    const report = gateway.validate(projectPath);

    expect(report.status).toBe('not-found');
    expect(report.issues).toEqual([]);
  });

  it('maps each validation issue field, message and severity', () => {
    writeJson(fallbackConfigPath, { server: { port: 70000 } });

    const gateway = new ValidationAdapterGateway({ configPath: fallbackConfigPath, envPath });
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
