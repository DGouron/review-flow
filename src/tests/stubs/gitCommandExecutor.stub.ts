import type {
  GitCommand,
  GitCommandExecutor,
  GitCommandKind,
  GitCommandResult,
} from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';

export interface StubProgrammedResponse {
  result: GitCommandResult;
}

export class StubGitCommandExecutor implements GitCommandExecutor {
  readonly calls: GitCommand[] = [];
  private readonly responsesByKind = new Map<GitCommandKind, GitCommandResult[]>();
  private readonly defaultResult: GitCommandResult = { exitCode: 0, stdout: '', stderr: '' };

  programResponse(kind: GitCommandKind, result: GitCommandResult): void {
    const existing = this.responsesByKind.get(kind) ?? [];
    existing.push(result);
    this.responsesByKind.set(kind, existing);
  }

  async execute(command: GitCommand): Promise<GitCommandResult> {
    this.calls.push(command);
    const queue = this.responsesByKind.get(command.kind);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next !== undefined) {
        return next;
      }
    }
    return this.defaultResult;
  }

  callsOfKind(kind: GitCommandKind): GitCommand[] {
    return this.calls.filter((call) => call.kind === kind);
  }
}
