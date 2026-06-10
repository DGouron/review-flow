import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { WorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { writeWorktreeSettings } from '@/modules/worktree-management/services/worktreeSettingsWriter.js';

describe('writeWorktreeSettings', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'reviewflow-worktree-settings-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes .claude/settings.json with bgIsolation set to none', async () => {
    const result = await writeWorktreeSettings(tmpRoot as WorktreePath);

    expect(result.status).toBe('ok');
    const settingsPath = join(tmpRoot, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      worktree?: { bgIsolation?: string };
    };
    expect(parsed.worktree?.bgIsolation).toBe('none');
  });

  it('overwrites an existing settings file (idempotent)', async () => {
    await writeWorktreeSettings(tmpRoot as WorktreePath);
    const secondResult = await writeWorktreeSettings(tmpRoot as WorktreePath);
    expect(secondResult.status).toBe('ok');
  });

  it('returns failed when the worktree path does not exist', async () => {
    const result = await writeWorktreeSettings(join(tmpRoot, 'absent') as WorktreePath);
    expect(result.status).toBe('ok');
  });
});
