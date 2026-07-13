import type { Language } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export interface ProjectConfigAgent {
  name: string;
  displayName: string;
}

// Shape consumed by the review engine at @/config/projectConfig.js
// (github/gitlab/defaultModel/reviewSkill/reviewFollowupSkill are required
// fields there — this must stay in sync with parseProjectConfig).
export interface ProjectConfigContents {
  github: boolean;
  gitlab: boolean;
  defaultModel: 'sonnet' | 'opus' | 'haiku';
  reviewSkill: string;
  reviewFollowupSkill: string;
  language: Language;
  agents?: ProjectConfigAgent[];
}

export interface ProjectConfigGateway {
  exists(projectPath: string): boolean;
  read(projectPath: string): ProjectConfigContents | null;
  write(projectPath: string, config: ProjectConfigContents): void;
  backup(projectPath: string): string | null;
}
