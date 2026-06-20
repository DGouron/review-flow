import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { SimpleCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type CommandExecutor = SimpleCommandExecutor;

interface DiffStatsSummary {
  additions: number;
  deletions: number;
}

function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null || !(field in value)) {
    throw new Error(`GitLab GraphQL response is missing "${field}"`);
  }
  return Reflect.get(value, field);
}

function extractDiffStatsSummary(response: unknown): DiffStatsSummary {
  const project = readField(readField(response, 'data'), 'project');
  const mergeRequest = readField(project, 'mergeRequest');
  const summary = readField(mergeRequest, 'diffStatsSummary');
  const additions = readField(summary, 'additions');
  const deletions = readField(summary, 'deletions');

  if (typeof additions !== 'number' || typeof deletions !== 'number') {
    throw new Error('GitLab GraphQL diff summary is missing additions or deletions');
  }

  return { additions, deletions };
}

export class GitLabDiffStatsFetchGateway implements DiffStatsFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchDiffStats(projectPath: string, mergeRequestNumber: number): DiffStats {
    const summary = this.fetchDiffSummary(projectPath, mergeRequestNumber);
    const commitsCount = this.fetchCommitsCount(projectPath, mergeRequestNumber);

    return {
      additions: summary.additions,
      deletions: summary.deletions,
      commitsCount,
    };
  }

  private fetchDiffSummary(projectPath: string, mergeRequestNumber: number): DiffStatsSummary {
    const query = `query { project(fullPath:"${projectPath}") { mergeRequest(iid:"${mergeRequestNumber}") { diffStatsSummary { additions deletions fileCount } } } }`;
    const response = this.executor(`glab api graphql -f query='${query}'`);
    return extractDiffStatsSummary(JSON.parse(response));
  }

  private fetchCommitsCount(projectPath: string, mergeRequestNumber: number): number {
    const encodedProject = projectPath.replace(/\//g, '%2F');
    const commitsResponse = this.executor(
      `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/commits`,
    );
    const commits: unknown = JSON.parse(commitsResponse);
    return Array.isArray(commits) ? commits.length : 0;
  }
}
