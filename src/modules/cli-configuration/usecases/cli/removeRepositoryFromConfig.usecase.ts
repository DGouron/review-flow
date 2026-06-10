import type { RepositoryEntry } from '@/modules/cli-configuration/entities/repositoryEntry/repositoryEntry.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface RemoveRepositoryFromConfigDependencies {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  existsSync: (path: string) => boolean;
}

export interface RemoveRepositoryFromConfigInput {
  configPath: string;
  localPath: string;
}

export interface RemoveRepositoryFromConfigResult {
  removed: RepositoryEntry | null;
  configPath: string;
}

export class RemoveRepositoryFromConfigUseCase implements UseCase<
  RemoveRepositoryFromConfigInput,
  RemoveRepositoryFromConfigResult
> {
  constructor(private readonly deps: RemoveRepositoryFromConfigDependencies) {}

  execute(input: RemoveRepositoryFromConfigInput): RemoveRepositoryFromConfigResult {
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

    const index = config.repositories.findIndex((repo) => repo.localPath === input.localPath);
    if (index < 0) {
      return { removed: null, configPath: input.configPath };
    }

    const [removed] = config.repositories.splice(index, 1);
    this.deps.writeFileSync(input.configPath, JSON.stringify(config, null, 2));

    return { removed: removed ?? null, configPath: input.configPath };
  }
}
