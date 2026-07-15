import { describe, it, expect, beforeEach } from 'vitest';

import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type { WorktreeIdentity } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import {
  ensureWorktree,
  type EnsureWorktreeDependencies,
} from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';
import { StubGitCommandExecutor } from '@/tests/stubs/gitCommandExecutor.stub.js';

interface StubFileSystem {
  existingPaths: Set<string>;
  settingsWrites: { path: string; content: string }[];
  removedDirectories: string[];
  assetSyncs: { path: string; sourceCheckoutPath: string }[];
}

function buildStubFileSystem(): StubFileSystem {
  return {
    existingPaths: new Set(),
    settingsWrites: [],
    removedDirectories: [],
    assetSyncs: [],
  };
}

function buildDeps(
  executor: StubGitCommandExecutor,
  fileSystem: StubFileSystem,
  overrides: Partial<EnsureWorktreeDependencies> = {},
): EnsureWorktreeDependencies {
  return {
    executor,
    worktreeExists: async (path) => fileSystem.existingPaths.has(path),
    removeDirectory: async (path) => {
      fileSystem.removedDirectories.push(path);
      fileSystem.existingPaths.delete(path);
    },
    writeWorktreeSettings: async (path) => {
      fileSystem.settingsWrites.push({ path, content: 'settings' });
      return { status: 'ok' };
    },
    syncTrustedClaudeAssets: async (path, sourceCheckoutPath) => {
      fileSystem.assetSyncs.push({ path, sourceCheckoutPath });
      return { status: 'ok' };
    },
    ...overrides,
  };
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
      buildDeps(executor, fileSystem),
    );

    expect(result).toEqual({ status: 'created', path: expectedPath, settingsWarning: null });
    const kinds = executor.calls.map((c) => c.kind);
    expect(kinds).toEqual(['worktree-prune', 'fetch', 'worktree-add']);
    expect(executor.callsOfKind('worktree-add')[0]?.args).toContain(expectedPath);
    expect(fileSystem.settingsWrites).toEqual([{ path: expectedPath, content: 'settings' }]);
    expect(fileSystem.assetSyncs).toEqual([{ path: expectedPath, sourceCheckoutPath: '/repo' }]);
  });

  it('reuses a healthy existing worktree by fast-forwarding it', async () => {
    fileSystem.existingPaths.add(expectedPath);

    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      buildDeps(executor, fileSystem),
    );

    expect(result).toEqual({ status: 'reused', path: expectedPath, settingsWarning: null });
    const kinds = executor.calls.map((c) => c.kind);
    expect(kinds).toEqual(['worktree-prune', 'rev-parse-toplevel', 'fetch', 'reset-hard']);
    expect(executor.callsOfKind('worktree-add')).toHaveLength(0);
    expect(fileSystem.removedDirectories).toEqual([]);
    expect(fileSystem.assetSyncs).toEqual([{ path: expectedPath, sourceCheckoutPath: '/repo' }]);
    expect(fileSystem.settingsWrites).toEqual([{ path: expectedPath, content: 'settings' }]);
  });

  it('fails the ensure when the trusted assets sync fails on a fresh create', async () => {
    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      buildDeps(executor, fileSystem, {
        syncTrustedClaudeAssets: async () => ({ status: 'failed', reason: 'EACCES' }),
      }),
    );

    expect(result).toEqual({ status: 'failed', reason: 'claude-assets-sync-failed' });
    expect(fileSystem.settingsWrites).toEqual([]);
  });

  it('fails the ensure when the trusted assets sync fails on a reused worktree', async () => {
    fileSystem.existingPaths.add(expectedPath);

    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      buildDeps(executor, fileSystem, {
        syncTrustedClaudeAssets: async () => ({ status: 'failed', reason: 'EACCES' }),
      }),
    );

    expect(result).toEqual({ status: 'failed', reason: 'claude-assets-sync-failed' });
    expect(fileSystem.settingsWrites).toEqual([]);
  });

  it('surfaces a settings warning on a reused worktree without failing', async () => {
    fileSystem.existingPaths.add(expectedPath);

    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      buildDeps(executor, fileSystem, {
        writeWorktreeSettings: async () => ({ status: 'failed', reason: 'disk-full' }),
      }),
    );

    expect(result).toEqual({ status: 'reused', path: expectedPath, settingsWarning: 'disk-full' });
  });

  it('self-heals a broken worktree directory by removing it and recreating', async () => {
    fileSystem.existingPaths.add(expectedPath);
    executor.programResponse('rev-parse-toplevel', {
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
    });

    const result = await ensureWorktree(
      {
        identity,
        sourceBranch: 'feat/x',
        source: { kind: 'origin' },
        sourceCheckoutPath: '/repo',
      },
      buildDeps(executor, fileSystem),
    );

    expect(result).toEqual({ status: 'created', path: expectedPath, settingsWarning: null });
    expect(fileSystem.removedDirectories).toEqual([expectedPath]);
    const kinds = executor.calls.map((c) => c.kind);
    expect(kinds).toEqual([
      'worktree-prune',
      'rev-parse-toplevel',
      'worktree-prune',
      'fetch',
      'worktree-add',
    ]);
    expect(executor.callsOfKind('worktree-add')[0]?.cwd).toBe('/repo');
  });

  it('uses the fork URL as remote when the source is a fork', async () => {
    await ensureWorktree(
      {
        identity,
        sourceBranch: 'patch-1',
        source: { kind: 'fork', cloneUrl: 'https://github.com/contributor/fork.git' },
        sourceCheckoutPath: '/repo',
      },
      buildDeps(executor, fileSystem),
    );

    const fetchCall = executor.callsOfKind('fetch')[0];
    expect(fetchCall?.args).toContain('https://github.com/contributor/fork.git');
    expect(fetchCall?.args).toContain(`patch-1:refs/remotes/pr-${identity.mrNumber}/head`);
    const addCall = executor.callsOfKind('worktree-add')[0];
    expect(addCall?.args).toContain(`refs/remotes/pr-${identity.mrNumber}/head`);
  });

  it('returns branch-not-found when the fetch fails on a fresh create', async () => {
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
      buildDeps(executor, fileSystem),
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('branch-not-found');
    }
    expect(executor.callsOfKind('worktree-add')).toHaveLength(0);
  });

  it('returns branch-not-found when a healthy worktree branch was deleted on the remote', async () => {
    fileSystem.existingPaths.add(expectedPath);
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
      buildDeps(executor, fileSystem),
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('branch-not-found');
    }
    expect(fileSystem.removedDirectories).toEqual([]);
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
      buildDeps(executor, fileSystem, {
        writeWorktreeSettings: async () => ({ status: 'failed', reason: 'disk-full' }),
      }),
    );

    expect(result.status).toBe('created');
    if (result.status === 'created') {
      expect(result.settingsWarning).toBe('disk-full');
    }
  });
});
