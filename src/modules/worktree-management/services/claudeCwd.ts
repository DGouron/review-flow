import { isAbsolute, relative } from 'node:path';

import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import type { WorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface ComputeClaudeCwdInput {
  localPath: string;
  gitRoot: string;
  worktreePath: WorktreePath;
}

function stripTrailingSlash(value: string): string {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }
  return value;
}

export function computeClaudeCwd(input: ComputeClaudeCwdInput): string {
  const localPath = stripTrailingSlash(input.localPath);
  const gitRoot = stripTrailingSlash(input.gitRoot);
  const worktreePath = stripTrailingSlash(input.worktreePath);

  const subPath = relative(gitRoot, localPath);

  if (subPath === '') {
    return worktreePath;
  }

  if (subPath.startsWith('..') || isAbsolute(subPath)) {
    throw new Error(`localPath ${input.localPath} is not inside gitRoot ${input.gitRoot}`);
  }

  return `${worktreePath}/${subPath}`;
}

export interface ResolveClaudeCwdInput {
  localPath: string;
  worktreePath: WorktreePath;
  executor: GitCommandExecutor;
}

export async function resolveClaudeCwd(input: ResolveClaudeCwdInput): Promise<string> {
  const result = await input.executor.execute({
    kind: 'rev-parse-toplevel',
    args: ['rev-parse', '--show-toplevel'],
    cwd: input.localPath,
  });

  if (result.exitCode !== 0) {
    return input.worktreePath;
  }

  const gitRoot = result.stdout.trim();
  if (gitRoot.length === 0) {
    return input.worktreePath;
  }

  try {
    return computeClaudeCwd({
      localPath: input.localPath,
      gitRoot,
      worktreePath: input.worktreePath,
    });
  } catch {
    return input.worktreePath;
  }
}
