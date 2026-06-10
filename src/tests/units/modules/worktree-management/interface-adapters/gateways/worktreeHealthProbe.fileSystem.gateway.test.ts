import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { WorktreeHealthProbeFileSystemGateway } from '@/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.js';
import { StubGitCommandExecutor } from '@/tests/stubs/gitCommandExecutor.stub.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

interface Scaffold {
  worktreeDirectory: string;
  mainRepoDirectory: string;
  gitWorktreeDirectory: string;
}

function buildEntry(absolutePath: string): WorktreeEntry {
  return {
    identity: { platform: 'gitlab', projectPath: 'group/project', mrNumber: 42 },
    path: createWorktreePath(absolutePath),
    mtime: new Date(),
  };
}

describe('WorktreeHealthProbeFileSystemGateway', () => {
  let temporaryRoot: string;
  let scaffold: Scaffold;
  let executor: StubGitCommandExecutor;

  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'reviewflow-healthprobe-'));
    scaffold = {
      worktreeDirectory: join(temporaryRoot, 'worktree'),
      mainRepoDirectory: join(temporaryRoot, 'main-repo'),
      gitWorktreeDirectory: join(temporaryRoot, 'main-repo', '.git', 'worktrees', 'wt-42'),
    };
    mkdirSync(scaffold.worktreeDirectory, { recursive: true });
    mkdirSync(scaffold.gitWorktreeDirectory, { recursive: true });
    writeFileSync(
      join(scaffold.worktreeDirectory, '.git'),
      `gitdir: ${scaffold.gitWorktreeDirectory}\n`,
    );
    executor = new StubGitCommandExecutor();
  });

  afterEach(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  describe('mtime', () => {
    it('returns the stat mtime of the worktree directory', async () => {
      const gateway = new WorktreeHealthProbeFileSystemGateway({ executor });
      const entry = buildEntry(scaffold.worktreeDirectory);

      const signals = await gateway.probe(entry);

      expect(signals.mtime).toBeInstanceOf(Date);
    });
  });

  describe('orphanLock', () => {
    it('reports no orphan lock when neither index.lock nor HEAD.lock exists', async () => {
      const gateway = new WorktreeHealthProbeFileSystemGateway({ executor });
      const entry = buildEntry(scaffold.worktreeDirectory);

      const signals = await gateway.probe(entry);

      expect(signals.orphanLock).toBeNull();
    });

    it('flags an orphan-git-lock when index.lock exists with an age', async () => {
      const lockPath = join(scaffold.gitWorktreeDirectory, 'index.lock');
      writeFileSync(lockPath, '');
      const twoHoursAgoSeconds = (Date.now() - 2 * ONE_HOUR_MS) / 1000;
      utimesSync(lockPath, twoHoursAgoSeconds, twoHoursAgoSeconds);

      const gateway = new WorktreeHealthProbeFileSystemGateway({ executor });
      const entry = buildEntry(scaffold.worktreeDirectory);

      const signals = await gateway.probe(entry);

      expect(signals.orphanLock).not.toBeNull();
      if (signals.orphanLock !== null) {
        expect(signals.orphanLock.present).toBe(true);
        expect(signals.orphanLock.path).toBe(lockPath);
        expect(signals.orphanLock.ageMs).toBeGreaterThanOrEqual(ONE_HOUR_MS);
      }
    });

    it('flags HEAD.lock when only HEAD.lock is present', async () => {
      const lockPath = join(scaffold.gitWorktreeDirectory, 'HEAD.lock');
      writeFileSync(lockPath, '');

      const gateway = new WorktreeHealthProbeFileSystemGateway({ executor });
      const entry = buildEntry(scaffold.worktreeDirectory);

      const signals = await gateway.probe(entry);

      expect(signals.orphanLock).not.toBeNull();
      if (signals.orphanLock !== null) {
        expect(signals.orphanLock.path).toBe(lockPath);
      }
    });
  });

  describe('unresolvedConflict', () => {
    it('reports false when git status porcelain shows no conflict markers', async () => {
      executor.programResponse('status-porcelain', {
        exitCode: 0,
        stdout: ' M src/foo.ts\n',
        stderr: '',
      });

      const gateway = new WorktreeHealthProbeFileSystemGateway({ executor });
      const entry = buildEntry(scaffold.worktreeDirectory);

      const signals = await gateway.probe(entry);

      expect(signals.unresolvedConflict).toBe(false);
    });

    it('reports true when git status porcelain shows a UU conflict marker', async () => {
      executor.programResponse('status-porcelain', {
        exitCode: 0,
        stdout: 'UU src/foo.ts\nAA src/bar.ts\n',
        stderr: '',
      });

      const gateway = new WorktreeHealthProbeFileSystemGateway({ executor });
      const entry = buildEntry(scaffold.worktreeDirectory);

      const signals = await gateway.probe(entry);

      expect(signals.unresolvedConflict).toBe(true);
    });
  });
});
