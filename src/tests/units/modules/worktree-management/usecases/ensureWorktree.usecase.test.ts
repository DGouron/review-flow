import { describe, it, expect, beforeEach } from 'vitest';

import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type { WorktreeIdentity } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ensureWorktree } from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';
import { StubGitCommandExecutor } from '@/tests/stubs/gitCommandExecutor.stub.js';

interface StubFileSystem {
  existingPaths: Set<string>;
  settingsWrites: { path: string; content: string }[];
}

function buildStubFileSystem(): StubFileSystem {
  return { existingPaths: new Set(), settingsWrites: [] };
}

const identity: WorktreeIdentity = {
  platform: 'gitlab',
  projectPath: 'group/project',
  mrNumber: 4242,
};
const expectedPath = deriveWorktreePath(identity);

describe('ensureWorktree use case', () => {
  let executor: StubGitCommandExecutor;
  let fileSystem: StubFileSystem;

  beforeEach(() => {
    executor = new StubGitCommandExecutor();
    fileSystem = buildStubFileSystem();
  });

  it('creates a new worktree when the path is absent on disk', async () => {
    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      {
        executor,
        worktreeExists: async (path) => fileSystem.existingPaths.has(path),
        writeWorktreeSettings: async (path) => {
          fileSystem.settingsWrites.push({ path, content: 'settings' });
          return { status: 'ok' };
        },
      },
    );

    expect(result).toEqual({ status: 'created', path: expectedPath, settingsWarning: null });
    const kinds = executor.calls.map((c) => c.kind);
    expect(kinds).toEqual(['worktree-prune', 'fetch', 'worktree-add']);
    expect(executor.callsOfKind('worktree-add')[0]?.args).toContain(expectedPath);
    expect(fileSystem.settingsWrites).toEqual([{ path: expectedPath, content: 'settings' }]);
  });

  it('reuses an existing worktree by fast-forwarding it', async () => {
    fileSystem.existingPaths.add(expectedPath);

    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      {
        executor,
        worktreeExists: async (path) => fileSystem.existingPaths.has(path),
        writeWorktreeSettings: async (path) => {
          fileSystem.settingsWrites.push({ path, content: 'settings' });
          return { status: 'ok' };
        },
      },
    );

    expect(result).toEqual({ status: 'reused', path: expectedPath });
    const kinds = executor.calls.map((c) => c.kind);
    expect(kinds).toEqual(['worktree-prune', 'fetch', 'reset-hard']);
    expect(executor.callsOfKind('worktree-add')).toHaveLength(0);
  });

  it('uses the fork URL as remote when the source is a fork', async () => {
    await ensureWorktree(
      {
        identity,
        sourceBranch: 'patch-1',
        source: { kind: 'fork', cloneUrl: 'https://github.com/contributor/fork.git' },
        sourceCheckoutPath: '/repo',
      },
      {
        executor,
        worktreeExists: async (path) => fileSystem.existingPaths.has(path),
        writeWorktreeSettings: async () => ({ status: 'ok' }),
      },
    );

    const fetchCall = executor.callsOfKind('fetch')[0];
    expect(fetchCall?.args).toContain('https://github.com/contributor/fork.git');
    expect(fetchCall?.args).toContain(`patch-1:refs/remotes/pr-${identity.mrNumber}/head`);
    const addCall = executor.callsOfKind('worktree-add')[0];
    expect(addCall?.args).toContain(`refs/remotes/pr-${identity.mrNumber}/head`);
  });

  it('returns branch-not-found when the fetch fails', async () => {
    executor.programResponse('fetch', {
      exitCode: 128,
      stdout: '',
      stderr: "fatal: couldn't find remote ref feat/x",
    });

    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      {
        executor,
        worktreeExists: async () => false,
        writeWorktreeSettings: async () => ({ status: 'ok' }),
      },
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('branch-not-found');
    }
    expect(executor.callsOfKind('worktree-add')).toHaveLength(0);
  });

  it('still returns created when settings write fails (no rollback) and surfaces the warning', async () => {
    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      {
        executor,
        worktreeExists: async () => false,
        writeWorktreeSettings: async () => ({ status: 'failed', reason: 'disk-full' }),
      },
    );

    expect(result.status).toBe('created');
    if (result.status === 'created') {
      expect(result.settingsWarning).toBe('disk-full');
    }
  });
});
