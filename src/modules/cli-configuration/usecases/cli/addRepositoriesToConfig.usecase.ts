import type { RepositoryEntry } from '@/modules/cli-configuration/entities/repositoryEntry/repositoryEntry.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface AddRepositoriesToConfigDependencies {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  existsSync: (path: string) => boolean;
}

export interface AddRepositoriesToConfigInput {
  configPath: string;
  newRepositories: RepositoryEntry[];
}

export interface AddRepositoriesToConfigResult {
  added: RepositoryEntry[];
  skipped: RepositoryEntry[];
  configPath: string;
}

export class AddRepositoriesToConfigUseCase implements UseCase<
  AddRepositoriesToConfigInput,
  AddRepositoriesToConfigResult
> {
  constructor(private readonly deps: AddRepositoriesToConfigDependencies) {}

  execute(input: AddRepositoriesToConfigInput): AddRepositoriesToConfigResult {
    if (!this.deps.existsSync(input.configPath)) {
      throw new Error(
        `Configuration file not found: ${input.configPath}\nRun 'reviewflow init' to create one.`,
      );
    }

    const raw = this.deps.readFileSync(input.configPath, 'utf-8');
    let config: { repositories: Array<{ localPath: string }>; [key: string]: unknown };
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in configuration file: ${input.configPath}`);
    }
    const existingPaths = new Set(
      config.repositories.map((r: { localPath: string }) => r.localPath),
    );

    const added: RepositoryEntry[] = [];
    const skipped: RepositoryEntry[] = [];

    for (const repo of input.newRepositories) {
      if (existingPaths.has(repo.localPath)) {
        skipped.push(repo);
      } else {
        added.push(repo);
      }
    }

    config.repositories.push(...added);
    this.deps.writeFileSync(input.configPath, JSON.stringify(config, null, 2));

    return { added, skipped, configPath: input.configPath };
  }
}
