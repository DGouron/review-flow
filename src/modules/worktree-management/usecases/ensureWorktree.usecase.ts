import type {
  GitCommandExecutor,
  GitCommandResult,
} from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import {
  deriveFetchRef,
  deriveWorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  EnsureResult,
  MrSource,
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface EnsureWorktreeInput {
  identity: WorktreeIdentity;
  sourceBranch: string;
  source: MrSource;
  sourceCheckoutPath: string;
}

export interface WorktreeSettingsWriteResult {
  status: 'ok' | 'failed';
  reason?: string;
}

export interface EnsureWorktreeDependencies {
  executor: GitCommandExecutor;
  worktreeExists: (path: WorktreePath) => Promise<boolean>;
  writeWorktreeSettings: (path: WorktreePath) => Promise<WorktreeSettingsWriteResult>;
}

function isFetchFailure(result: GitCommandResult): boolean {
  return result.exitCode !== 0;
}

export async function ensureWorktree(
  input: EnsureWorktreeInput,
  deps: EnsureWorktreeDependencies,
): Promise<EnsureResult> {
  const targetPath = deriveWorktreePath(input.identity);
  const fetchRef = deriveFetchRef(input.source, input.sourceBranch, input.identity.mrNumber);

  await deps.executor.execute({
    kind: 'worktree-prune',
    args: ['worktree', 'prune'],
    cwd: input.sourceCheckoutPath,
  });

  const alreadyExists = await deps.worktreeExists(targetPath);

  if (alreadyExists) {
    const fetchInsideResult = await deps.executor.execute({
      kind: 'fetch',
      args: ['fetch', fetchRef.remote, fetchRef.refspec],
      cwd: targetPath,
    });
    if (isFetchFailure(fetchInsideResult)) {
      return { status: 'failed', reason: 'branch-not-found' };
    }

    const resetResult = await deps.executor.execute({
      kind: 'reset-hard',
      args: ['reset', '--hard', fetchRef.worktreeRef],
      cwd: targetPath,
    });
    if (resetResult.exitCode !== 0) {
      return { status: 'failed', reason: 'reset-failed' };
    }

    return { status: 'reused', path: targetPath };
  }

  const fetchResult = await deps.executor.execute({
    kind: 'fetch',
    args: ['fetch', fetchRef.remote, fetchRef.refspec],
    cwd: input.sourceCheckoutPath,
  });
  if (isFetchFailure(fetchResult)) {
    return { status: 'failed', reason: 'branch-not-found' };
  }

  const addResult = await deps.executor.execute({
    kind: 'worktree-add',
    args: ['worktree', 'add', targetPath, fetchRef.worktreeRef],
    cwd: input.sourceCheckoutPath,
  });
  if (addResult.exitCode !== 0) {
    return { status: 'failed', reason: 'worktree-add-failed' };
  }

  const settingsResult = await deps.writeWorktreeSettings(targetPath);
  const settingsWarning =
    settingsResult.status === 'failed' ? (settingsResult.reason ?? 'unknown') : null;

  return { status: 'created', path: targetPath, settingsWarning };
}
