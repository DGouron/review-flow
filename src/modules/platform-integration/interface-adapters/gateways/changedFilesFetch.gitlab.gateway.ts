import type { ChangedFilesFetchGateway } from '@/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.js';
import type { ChangedFile } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';
import type { SimpleCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type CommandExecutor = SimpleCommandExecutor;

function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null || !(field in value)) {
    throw new Error(`GitLab GraphQL response is missing "${field}"`);
  }
  return Reflect.get(value, field);
}

function toChangedFile(entry: unknown): ChangedFile {
  const path = readField(entry, 'path');
  const additions = readField(entry, 'additions');
  const deletions = readField(entry, 'deletions');

  if (typeof path !== 'string' || typeof additions !== 'number' || typeof deletions !== 'number') {
    throw new Error('GitLab GraphQL diffStats entry has invalid fields');
  }

  return { path, additions, deletions };
}

function extractChangedFiles(response: unknown): ChangedFile[] {
  const project = readField(readField(response, 'data'), 'project');
  const mergeRequest = readField(project, 'mergeRequest');
  const diffStats = readField(mergeRequest, 'diffStats');

  if (!Array.isArray(diffStats)) {
    throw new Error('GitLab GraphQL diffStats is not an array');
  }

  return diffStats.map(toChangedFile);
}

export class GitLabChangedFilesFetchGateway implements ChangedFilesFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchChangedFiles(projectPath: string, mergeRequestNumber: number): ChangedFile[] | null {
    try {
      const query = `query { project(fullPath:"${projectPath}") { mergeRequest(iid:"${mergeRequestNumber}") { diffStats { path additions deletions } } } }`;
      const response = this.executor(`glab api graphql -f query='${query}'`);
      return extractChangedFiles(JSON.parse(response));
    } catch {
      return null;
    }
  }
}
