import type { ChangedFilesFetchGateway } from '@/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.js';
import type { ChangedFile } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';
import type { SimpleCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type CommandExecutor = SimpleCommandExecutor;

function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null || !(field in value)) {
    throw new Error(`GitHub pulls/files entry is missing "${field}"`);
  }
  return Reflect.get(value, field);
}

function toChangedFile(entry: unknown): ChangedFile {
  const filename = readField(entry, 'filename');
  const additions = readField(entry, 'additions');
  const deletions = readField(entry, 'deletions');

  if (
    typeof filename !== 'string' ||
    typeof additions !== 'number' ||
    typeof deletions !== 'number'
  ) {
    throw new Error('GitHub pulls/files entry has invalid fields');
  }

  return { path: filename, additions, deletions };
}

export class GitHubChangedFilesFetchGateway implements ChangedFilesFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchChangedFiles(projectPath: string, mergeRequestNumber: number): ChangedFile[] | null {
    try {
      const response = this.executor(
        `gh api --paginate repos/${projectPath}/pulls/${mergeRequestNumber}/files`,
      );
      const parsed: unknown = JSON.parse(response);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed.map(toChangedFile);
    } catch {
      return null;
    }
  }
}
