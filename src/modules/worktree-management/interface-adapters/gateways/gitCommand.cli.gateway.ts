import { spawn } from 'node:child_process';

import type {
  GitCommand,
  GitCommandExecutor,
  GitCommandResult,
} from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';

export type GitProcessRunner = (command: GitCommand) => Promise<GitCommandResult>;

function defaultGitRunner(): GitProcessRunner {
  return async (command) =>
    new Promise<GitCommandResult>((resolve, reject) => {
      const child = spawn('git', command.args, { cwd: command.cwd });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
}

export class GitCommandCliGateway implements GitCommandExecutor {
  private readonly runner: GitProcessRunner;

  constructor(runner: GitProcessRunner = defaultGitRunner()) {
    this.runner = runner;
  }

  async execute(command: GitCommand): Promise<GitCommandResult> {
    return this.runner(command);
  }
}
