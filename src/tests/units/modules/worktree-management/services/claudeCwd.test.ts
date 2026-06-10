import { describe, it, expect } from 'vitest';

import type {
  GitCommand,
  GitCommandExecutor,
  GitCommandResult,
} from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import {
  computeClaudeCwd,
  resolveClaudeCwd,
} from '@/modules/worktree-management/services/claudeCwd.js';

function stubExecutor(commands: { stdout: string; exitCode?: number }[]): {
  executor: GitCommandExecutor;
  calls: GitCommand[];
} {
  const calls: GitCommand[] = [];
  let index = 0;
  const executor: GitCommandExecutor = {
    async execute(command: GitCommand): Promise<GitCommandResult> {
      calls.push(command);
      const next = commands[index];
      index += 1;
      return {
        stdout: next?.stdout ?? '',
        stderr: '',
        exitCode: next?.exitCode ?? 0,
      };
    },
  };
  return { executor, calls };
}

describe('computeClaudeCwd', () => {
  it('returns the worktree path unchanged when localPath equals gitRoot', () => {
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');
    const result = computeClaudeCwd({
      localPath: '/home/user/repos/acme',
      gitRoot: '/home/user/repos/acme',
      worktreePath,
    });
    expect(result).toBe('/wt/gitlab-acme-42');
  });

  it('appends the relative sub-path when localPath sits inside a monorepo', () => {
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');
    const result = computeClaudeCwd({
      localPath: '/home/user/repos/acme/frontend',
      gitRoot: '/home/user/repos/acme',
      worktreePath,
    });
    expect(result).toBe('/wt/gitlab-acme-42/frontend');
  });

  it('appends a nested sub-path for deeper checkouts', () => {
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');
    const result = computeClaudeCwd({
      localPath: '/home/user/repos/acme/apps/dashboard',
      gitRoot: '/home/user/repos/acme',
      worktreePath,
    });
    expect(result).toBe('/wt/gitlab-acme-42/apps/dashboard');
  });

  it('normalises trailing slashes on localPath and gitRoot', () => {
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');
    const result = computeClaudeCwd({
      localPath: '/home/user/repos/acme/frontend/',
      gitRoot: '/home/user/repos/acme/',
      worktreePath,
    });
    expect(result).toBe('/wt/gitlab-acme-42/frontend');
  });

  it('throws when localPath is not contained in gitRoot', () => {
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');
    expect(() =>
      computeClaudeCwd({
        localPath: '/elsewhere/project',
        gitRoot: '/home/user/repos/acme',
        worktreePath,
      }),
    ).toThrow(/not inside/i);
  });
});

describe('resolveClaudeCwd', () => {
  it('queries git rev-parse --show-toplevel and applies the relative sub-path', async () => {
    const { executor, calls } = stubExecutor([{ stdout: '/home/user/repos/acme\n' }]);
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');

    const result = await resolveClaudeCwd({
      localPath: '/home/user/repos/acme/frontend',
      worktreePath,
      executor,
    });

    expect(result).toBe('/wt/gitlab-acme-42/frontend');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: 'rev-parse-toplevel',
      args: ['rev-parse', '--show-toplevel'],
      cwd: '/home/user/repos/acme/frontend',
    });
  });

  it('returns the worktree path unchanged when the source checkout is already the git root', async () => {
    const { executor } = stubExecutor([{ stdout: '/home/user/repos/acme\n' }]);
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');

    const result = await resolveClaudeCwd({
      localPath: '/home/user/repos/acme',
      worktreePath,
      executor,
    });

    expect(result).toBe('/wt/gitlab-acme-42');
  });

  it('falls back to the worktree path when rev-parse fails', async () => {
    const { executor } = stubExecutor([{ stdout: '', exitCode: 128 }]);
    const worktreePath = createWorktreePath('/wt/gitlab-acme-42');

    const result = await resolveClaudeCwd({
      localPath: '/home/user/repos/acme/frontend',
      worktreePath,
      executor,
    });

    expect(result).toBe('/wt/gitlab-acme-42');
  });
});
