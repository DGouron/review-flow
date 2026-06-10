import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type {
  HealthSignals,
  WorktreeHealthProbeGateway,
  OrphanLockSignal,
} from '@/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.js';

export interface WorktreeHealthProbeFileSystemGatewayDependencies {
  executor: GitCommandExecutor;
  now?: () => Date;
}

const CONFLICT_PORCELAIN_PREFIXES = ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'];

function readGitDir(worktreePath: string): string | null {
  const gitPointerPath = join(worktreePath, '.git');
  if (!existsSync(gitPointerPath)) return null;
  try {
    const stat = statSync(gitPointerPath);
    if (stat.isDirectory()) return gitPointerPath;
    const content = readFileSync(gitPointerPath, 'utf-8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match) return null;
    const target = match[1];
    if (target === undefined) return null;
    return isAbsolute(target) ? target : resolve(worktreePath, target);
  } catch {
    return null;
  }
}

function detectOrphanLock(gitDir: string, now: Date): OrphanLockSignal | null {
  for (const lockName of ['index.lock', 'HEAD.lock']) {
    const lockPath = join(gitDir, lockName);
    if (!existsSync(lockPath)) continue;
    try {
      const stat = statSync(lockPath);
      const ageMs = Math.max(0, now.getTime() - stat.mtime.getTime());
      return { present: true, path: lockPath, ageMs };
    } catch {
      return null;
    }
  }
  return null;
}

function detectConflict(stdout: string): boolean {
  const lines = stdout.split('\n');
  for (const line of lines) {
    const head = line.slice(0, 2);
    if (CONFLICT_PORCELAIN_PREFIXES.includes(head)) return true;
  }
  return false;
}

function readMtime(worktreePath: string, fallback: Date): Date {
  try {
    return statSync(worktreePath).mtime;
  } catch {
    return fallback;
  }
}

export class WorktreeHealthProbeFileSystemGateway implements WorktreeHealthProbeGateway {
  private readonly executor: GitCommandExecutor;
  private readonly now: () => Date;

  constructor(deps: WorktreeHealthProbeFileSystemGatewayDependencies) {
    this.executor = deps.executor;
    this.now = deps.now ?? (() => new Date());
  }

  async probe(entry: WorktreeEntry): Promise<HealthSignals> {
    const now = this.now();
    const mtime = readMtime(entry.path, entry.mtime);

    const gitDir = readGitDir(entry.path);
    const orphanLock = gitDir === null ? null : detectOrphanLock(gitDir, now);

    let unresolvedConflict = false;
    try {
      const statusResult = await this.executor.execute({
        kind: 'status-porcelain',
        args: ['status', '--porcelain=v1'],
        cwd: entry.path,
      });
      if (statusResult.exitCode === 0) {
        unresolvedConflict = detectConflict(statusResult.stdout);
      }
    } catch {
      unresolvedConflict = false;
    }

    return {
      mtime,
      orphanLock,
      unresolvedConflict,
    };
  }
}
