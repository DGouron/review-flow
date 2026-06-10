import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { parseProjectConfig } from '@/config/projectConfig.js';
import type {
  ProjectConfigGateway,
  ProjectConfigReadResult,
  ProjectConfigWriteResult,
} from '@/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.js';

function resolveConfigPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'config.json');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class ProjectConfigFileSystemGateway implements ProjectConfigGateway {
  read(projectPath: string): ProjectConfigReadResult {
    const configPath = resolveConfigPath(projectPath);
    if (!existsSync(configPath)) {
      return { status: 'not-found' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      return { status: 'malformed' };
    }
    if (!isPlainObject(parsed)) {
      return { status: 'malformed' };
    }
    try {
      const config = parseProjectConfig(parsed);
      return { status: 'ok', config };
    } catch {
      return { status: 'malformed' };
    }
  }

  write(projectPath: string, config: ProjectConfig): ProjectConfigWriteResult {
    const configPath = resolveConfigPath(projectPath);
    const tempPath = configPath + '.tmp';
    try {
      writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
      renameSync(tempPath, configPath);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message };
    }
  }
}
