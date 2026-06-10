export interface RepositoryConfig {
  name: string;
  platform: 'gitlab' | 'github';
  remoteUrl: string;
  localPath: string;
  skill: string;
  enabled: boolean;
}
