import { describe, it, expect, beforeEach } from 'vitest';

import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { removeWorktree } from '@/modules/worktree-management/usecases/removeWorktree.usecase.js';
import { StubGitCommandExecutor } from '@/tests/stubs/gitCommandExecutor.stub.js';

const identity: WorktreeIdentity = {
  platform: 'gitlab',
  projectPath: 'group/project',
  mrNumber: 99,
};
const expectedPath = deriveWorktreePath(identity);

describe('removeWorktree use case', () => {
  let executor: StubGitCommandExecutor;
  let existingPaths: Set<string>;

  beforeEach(() => {
    executor = new StubGitCommandExecutor();
    existingPaths = new Set();
  });

  it('removes an existing worktree via git worktree remove --force', async () => {
    existingPaths.add(expectedPath);

    const result = await removeWorktree(
      { identity, sourceCheckoutPath: '/repo' },
      {
        executor,
        worktreeExists: async (path: WorktreePath) => existingPaths.has(path),
      },
    );

    expect(result).toEqual({ status: 'removed' });
    const removeCalls = executor.callsOfKind('worktree-remove');
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]?.args).toContain('--force');
    expect(removeCalls[0]?.args).toContain(expectedPath);
  });

  it('returns absent when the worktree is missing on disk', async () => {
    const result = await removeWorktree(
      { identity, sourceCheckoutPath: '/repo' },
      {
        executor,
        worktreeExists: async () => false,
      },
    );

    expect(result).toEqual({ status: 'absent' });
    expect(executor.callsOfKind('worktree-remove')).toHaveLength(0);
  });

  it('returns failed with warning when git worktree remove fails', async () => {
    existingPaths.add(expectedPath);
    executor.programResponse('worktree-remove', {
      exitCode: 1,
      stdout: '',
      stderr: 'fatal: worktree is locked',
    });

    const result = await removeWorktree(
      { identity, sourceCheckoutPath: '/repo' },
      {
        executor,
        worktreeExists: async () => existingPaths.has(expectedPath),
      },
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.warning).toContain('worktree is locked');
    }
  });

  describe('force mode', () => {
    it('returns removed when force is true and the worktree is missing on disk (registry-only cleanup)', async () => {
      const result = await removeWorktree(
        { identity, sourceCheckoutPath: '/repo', force: true },
        {
          executor,
          worktreeExists: async () => false,
        },
      );

      expect(result).toEqual({ status: 'removed' });
      expect(executor.callsOfKind('worktree-prune')).toHaveLength(1);
      expect(executor.callsOfKind('worktree-remove')).toHaveLength(0);
    });

    it('still attempts git worktree remove when force is true and the worktree exists', async () => {
      existingPaths.add(expectedPath);

      const result = await removeWorktree(
        { identity, sourceCheckoutPath: '/repo', force: true },
        {
          executor,
          worktreeExists: async () => existingPaths.has(expectedPath),
        },
      );

      expect(result).toEqual({ status: 'removed' });
      expect(executor.callsOfKind('worktree-remove')).toHaveLength(1);
    });

    it('preserves backwards-compatible behavior when force is unset (absent if missing on disk)', async () => {
      const result = await removeWorktree(
        { identity, sourceCheckoutPath: '/repo' },
        {
          executor,
          worktreeExists: async () => false,
        },
      );

      expect(result).toEqual({ status: 'absent' });
    });
  });
});
