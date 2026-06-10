import type { ProjectConfig } from '@/config/projectConfig.js';

export type ProjectConfigReadResult =
  | { status: 'ok'; config: ProjectConfig }
  | { status: 'not-found' }
  | { status: 'malformed' };

export type ProjectConfigWriteResult = { ok: true } | { ok: false; reason: string };

export interface ProjectConfigGateway {
  read(projectPath: string): ProjectConfigReadResult;
  write(projectPath: string, config: ProjectConfig): ProjectConfigWriteResult;
}
