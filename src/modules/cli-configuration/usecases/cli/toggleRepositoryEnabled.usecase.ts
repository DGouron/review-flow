import type { RepositoryEntry } from '@/modules/cli-configuration/entities/repositoryEntry/repositoryEntry.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface ToggleRepositoryEnabledDependencies {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  existsSync: (path: string) => boolean;
}

export interface ToggleRepositoryEnabledInput {
  configPath: string;
  localPath: string;
  enabled: boolean;
}

export interface ToggleRepositoryEnabledResult {
  updated: RepositoryEntry | null;
  configPath: string;
}

export class ToggleRepositoryEnabledUseCase implements UseCase<
  ToggleRepositoryEnabledInput,
  ToggleRepositoryEnabledResult
> {
  constructor(private readonly deps: ToggleRepositoryEnabledDependencies) {}

  execute(input: ToggleRepositoryEnabledInput): ToggleRepositoryEnabledResult {
    if (!this.deps.existsSync(input.configPath)) {
      throw new Error(
        `Configuration file not found: ${input.configPath}\nRun 'reviewflow init' to create one.`,
      );
    }

    const raw = this.deps.readFileSync(input.configPath, 'utf-8');
    let config: { repositories: RepositoryEntry[]; [key: string]: unknown };
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in configuration file: ${input.configPath}`);
    }

    const target = config.repositories.find((repo) => repo.localPath === input.localPath);
    if (!target) {
      return { updated: null, configPath: input.configPath };
    }

    target.enabled = input.enabled;
    this.deps.writeFileSync(input.configPath, JSON.stringify(config, null, 2));

    return { updated: target, configPath: input.configPath };
  }
}
