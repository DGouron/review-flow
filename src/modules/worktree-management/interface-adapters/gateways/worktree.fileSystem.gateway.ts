import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
// deriveWorktreePath is re-exported for callers; eslint-disable-next-line is unnecessary.
import type {
  EnsureWorktreeRequest,
  RemoveWorktreeRequest,
  WorktreeGateway,
} from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import {
  createWorktreePath,
  deriveWorktreePath,
  parseWorktreeDirectoryName,
} from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  EnsureResult,
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { syncTrustedClaudeAssets } from '@/modules/worktree-management/services/trustedClaudeAssetsSync.js';
import { writeWorktreeSettings } from '@/modules/worktree-management/services/worktreeSettingsWriter.js';
import { ensureWorktree } from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';
import { removeWorktree } from '@/modules/worktree-management/usecases/removeWorktree.usecase.js';
import { WORKTREE_BASE_DIR } from '@/shared/services/daemonPaths.js';

export interface WorktreeFileSystemGatewayDependencies {
  executor: GitCommandExecutor;
  baseDirectory?: string;
}

export class WorktreeFileSystemGateway implements WorktreeGateway {
  private readonly executor: GitCommandExecutor;
  private readonly baseDirectory: string;

  constructor(deps: WorktreeFileSystemGatewayDependencies) {
    this.executor = deps.executor;
    this.baseDirectory = deps.baseDirectory ?? WORKTREE_BASE_DIR;
  }

  async ensure(request: EnsureWorktreeRequest): Promise<EnsureResult> {
    mkdirSync(this.baseDirectory, { recursive: true });
    return ensureWorktree(
      {
        identity: request.identity,
        sourceBranch: request.sourceBranch,
        source: request.source,
        sourceCheckoutPath: request.sourceCheckoutPath,
      },
      {
        executor: this.executor,
        worktreeExists: async (path) => existsSync(path),
        removeDirectory: async (path) => rmSync(path, { recursive: true, force: true }),
        writeWorktreeSettings,
        syncTrustedClaudeAssets,
      },
    );
  }

  async remove(request: RemoveWorktreeRequest): Promise<RemoveResult> {
    try {
      return await removeWorktree(
        {
          identity: request.identity,
          sourceCheckoutPath: request.sourceCheckoutPath,
          force: request.force === true,
        },
        {
          executor: this.executor,
          worktreeExists: async (path) => existsSync(path),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'failed', warning: message };
    }
  }

  async exists(identity: WorktreeIdentity): Promise<boolean> {
    return existsSync(deriveWorktreePath(identity));
  }

  async list(): Promise<WorktreeEntry[]> {
    if (!existsSync(this.baseDirectory)) {
      return [];
    }
    const directories = readdirSync(this.baseDirectory, { withFileTypes: true });
    const entries: WorktreeEntry[] = [];
    for (const dirent of directories) {
      if (!dirent.isDirectory()) continue;
      const identity = parseWorktreeDirectoryName(dirent.name);
      if (identity === null) continue;
      const path = createWorktreePath(join(this.baseDirectory, dirent.name));
      try {
        const stats = statSync(path);
        entries.push({ identity, path, mtime: stats.mtime });
      } catch {
        // ignore worktrees whose stat fails (transient FS errors, race with removal)
      }
    }
    return entries;
  }
}
