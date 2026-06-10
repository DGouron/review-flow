// Strangler Fig: Re-export from new location
// This file will be removed once all imports are updated
export {
  loadConfig,
  loadEnvSecrets,
  findRepositoryByRemoteUrl,
  findRepositoryByProjectPath,
} from '@/frameworks/config/configLoader.js';

export type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
export type {
  Config,
  ServerConfig,
  UserConfig,
  QueueConfig,
  EnvSecrets,
} from '@/frameworks/config/configLoader.js';
