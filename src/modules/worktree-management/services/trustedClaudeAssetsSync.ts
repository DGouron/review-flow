import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { WorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { WorktreeSettingsWriteResult } from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';

const TRUSTED_CLAUDE_DIRECTORIES = ['skills', 'agents', 'commands'] as const;

export async function syncTrustedClaudeAssets(
  worktreePath: WorktreePath,
  sourceCheckoutPath: string,
): Promise<WorktreeSettingsWriteResult> {
  try {
    for (const directory of TRUSTED_CLAUDE_DIRECTORIES) {
      const worktreeDirectory = join(worktreePath, '.claude', directory);
      rmSync(worktreeDirectory, { recursive: true, force: true });
      const sourceDirectory = join(sourceCheckoutPath, '.claude', directory);
      if (existsSync(sourceDirectory)) {
        cpSync(sourceDirectory, worktreeDirectory, { recursive: true });
      }
    }
    return { status: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', reason: message };
  }
}
