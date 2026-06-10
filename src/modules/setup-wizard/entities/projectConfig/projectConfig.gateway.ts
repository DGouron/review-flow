import type {
  Preset,
  Language,
} from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export interface ProjectConfigContents {
  preset: Preset;
  language: Language;
  agents: string[];
}

export interface ProjectConfigGateway {
  exists(projectPath: string): boolean;
  read(projectPath: string): ProjectConfigContents | null;
  write(projectPath: string, config: ProjectConfigContents): void;
  backup(projectPath: string): string | null;
}
