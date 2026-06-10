import { isAbsolute, join } from 'node:path';

import type {
  FetchRef,
  MrSource,
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { WORKTREE_BASE_DIR } from '@/shared/services/daemonPaths.js';

/**
 * Single chokepoint constructor for the WorktreePath branded type. Any
 * other call site that needs a WorktreePath must go through this factory
 * rather than casting a raw string. Validates absoluteness so accidental
 * relative paths are caught at the boundary.
 */
function isWorktreePath(value: string): value is WorktreePath {
  return value.length > 0 && isAbsolute(value);
}

export function createWorktreePath(value: string): WorktreePath {
  if (!isWorktreePath(value)) {
    throw new Error(`Invalid worktree path (must be absolute, non-empty): ${value}`);
  }
  return value;
}

export function deriveWorktreeSlug(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

export function deriveWorktreeDirectoryName(identity: WorktreeIdentity): string {
  const slug = deriveWorktreeSlug(identity.projectPath);
  return `${identity.platform}-${slug}-${identity.mrNumber}`;
}

export function deriveWorktreePath(identity: WorktreeIdentity): WorktreePath {
  return createWorktreePath(join(WORKTREE_BASE_DIR, deriveWorktreeDirectoryName(identity)));
}

export function deriveFetchRef(source: MrSource, sourceBranch: string, mrNumber: number): FetchRef {
  if (source.kind === 'origin') {
    return {
      remote: 'origin',
      refspec: sourceBranch,
      worktreeRef: `origin/${sourceBranch}`,
    };
  }
  const worktreeRef = `refs/remotes/pr-${mrNumber}/head`;
  return {
    remote: source.cloneUrl,
    refspec: `${sourceBranch}:${worktreeRef}`,
    worktreeRef,
  };
}

export function parseWorktreeDirectoryName(directoryName: string): WorktreeIdentity | null {
  const match = directoryName.match(/^(gitlab|github)-(.+)-(\d+)$/);
  if (!match) return null;
  const platform = match[1] === 'github' ? 'github' : 'gitlab';
  const slug = match[2];
  const mrNumberRaw = match[3];
  if (slug === undefined || mrNumberRaw === undefined) return null;
  const mrNumber = Number.parseInt(mrNumberRaw, 10);
  if (!Number.isFinite(mrNumber) || mrNumber <= 0) return null;
  return {
    platform,
    projectPath: slug,
    mrNumber,
  };
}
