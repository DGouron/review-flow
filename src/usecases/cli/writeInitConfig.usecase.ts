import { join } from 'node:path';

export interface WriteInitConfigDependencies {
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  writeFileSync: (path: string, content: string) => void;
}

interface RepositoryEntry {
  name: string;
  localPath: string;
  enabled: boolean;
}

export interface WriteInitConfigInput {
  configDir: string;
  port: number;
  gitlabUsername: string;
  githubUsername: string;
  repositories: RepositoryEntry[];
  gitlabWebhookSecret: string;
  githubWebhookSecret: string;
}

export interface WriteInitConfigResult {
  configPath: string;
  envPath: string;
}

export class WriteInitConfigUseCase {
  constructor(private readonly deps: WriteInitConfigDependencies) {}

  execute(input: WriteInitConfigInput): WriteInitConfigResult {
    this.deps.mkdirSync(input.configDir, { recursive: true });

    const configPath = join(input.configDir, 'config.json');
    const envPath = join(input.configDir, '.env');

    const config = {
      server: { port: input.port },
      user: {
        gitlabUsername: input.gitlabUsername,
        githubUsername: input.githubUsername,
      },
      queue: {
        maxConcurrent: 2,
        deduplicationWindowMs: 300000,
      },
      repositories: input.repositories.map(repo => ({
        name: repo.name,
        localPath: repo.localPath,
        enabled: repo.enabled,
      })),
    };

    this.deps.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const envContent = [
      `GITLAB_WEBHOOK_TOKEN=${input.gitlabWebhookSecret}`,
      `GITHUB_WEBHOOK_SECRET=${input.githubWebhookSecret}`,
      '',
    ].join('\n');

    this.deps.writeFileSync(envPath, envContent);

    return { configPath, envPath };
  }
}
