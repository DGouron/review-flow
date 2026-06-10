import { describe, it, expect } from 'vitest';

import type {
  GitCommand,
  GitCommandResult,
} from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import { GitCommandCliGateway } from '@/modules/worktree-management/interface-adapters/gateways/gitCommand.cli.gateway.js';

describe('GitCommandCliGateway', () => {
  it('delegates execution to the injected runner with full command', async () => {
    const receivedCommands: GitCommand[] = [];
    const stubResult: GitCommandResult = { exitCode: 0, stdout: 'ok', stderr: '' };
    const gateway = new GitCommandCliGateway(async (command) => {
      receivedCommands.push(command);
      return stubResult;
    });

    const command: GitCommand = {
      kind: 'fetch',
      args: ['fetch', 'origin', 'main'],
      cwd: '/repo',
    };
    const result = await gateway.execute(command);

    expect(result).toBe(stubResult);
    expect(receivedCommands).toEqual([command]);
  });

  it('returns the result from the injected runner verbatim', async () => {
    const gateway = new GitCommandCliGateway(async () => ({
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
    }));

    const result = await gateway.execute({
      kind: 'worktree-prune',
      args: ['worktree', 'prune'],
      cwd: '/repo',
    });

    expect(result.exitCode).toBe(128);
    expect(result.stderr).toContain('not a git repository');
  });
});
