import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

import { z } from 'zod';

import type {
  ProjectConfigGateway,
  ProjectConfigContents,
} from '@/modules/setup-wizard/entities/projectConfig/projectConfig.gateway.js';

const projectConfigSchema = z.object({
  preset: z.enum(['backend', 'frontend', 'fullstack', 'basic', 'custom']),
  language: z.enum(['en', 'fr']),
  agents: z.array(z.string()),
});

function resolveConfigPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'config.json');
}

export class ProjectConfigFileSystemGateway implements ProjectConfigGateway {
  exists(projectPath: string): boolean {
    return existsSync(resolveConfigPath(projectPath));
  }

  read(projectPath: string): ProjectConfigContents | null {
    const path = resolveConfigPath(projectPath);
    if (!existsSync(path)) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      const result = projectConfigSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  write(projectPath: string, config: ProjectConfigContents): void {
    const path = resolveConfigPath(projectPath);
    mkdirSync(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    renameSync(tempPath, path);
  }

  backup(projectPath: string): string | null {
    const path = resolveConfigPath(projectPath);
    if (!existsSync(path)) return null;
    const backupPath = `${path}.bak`;
    copyFileSync(path, backupPath);
    return backupPath;
  }
}
