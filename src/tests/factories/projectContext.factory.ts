import type {
  ProjectContext,
  Platform,
  Preset,
  Language,
} from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

interface ProjectContextOverrides {
  localPath?: string | null;
  platform?: Platform | null;
  preset?: Preset | null;
  language?: Language | null;
  remoteUrl?: string | null;
}

export const ProjectContextFactory = {
  create(overrides: ProjectContextOverrides = {}): ProjectContext {
    return {
      localPath: overrides.localPath ?? '/tmp/project',
      platform: overrides.platform ?? 'github',
      preset: overrides.preset ?? 'backend',
      language: overrides.language ?? 'en',
      remoteUrl: overrides.remoteUrl ?? 'git@github.com:org/repo.git',
    };
  },
};
