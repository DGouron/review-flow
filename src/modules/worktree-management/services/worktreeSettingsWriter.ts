import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { WorktreeSettingsWriteResult } from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';

const settingsContent = JSON.stringify({ worktree: { bgIsolation: 'none' } }, null, 2);

export async function writeWorktreeSettings(
  worktreePath: WorktreePath,
): Promise<WorktreeSettingsWriteResult> {
  try {
    const claudeDirectory = join(worktreePath, '.claude');
    mkdirSync(claudeDirectory, { recursive: true });
    writeFileSync(join(claudeDirectory, 'settings.json'), settingsContent);
    return { status: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', reason: message };
  }
}
