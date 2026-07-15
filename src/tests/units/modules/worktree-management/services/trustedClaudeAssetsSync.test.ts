import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { WorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { syncTrustedClaudeAssets } from '@/modules/worktree-management/services/trustedClaudeAssetsSync.js';

function writeAsset(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
}

describe('syncTrustedClaudeAssets', () => {
  let tmpRoot: string;
  let worktreePath: string;
  let sourceCheckoutPath: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'reviewflow-trusted-assets-'));
    worktreePath = join(tmpRoot, 'worktree');
    sourceCheckoutPath = join(tmpRoot, 'source');
    mkdirSync(worktreePath, { recursive: true });
    mkdirSync(sourceCheckoutPath, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('copies skills from the source checkout into a worktree that has none', async () => {
    writeAsset(sourceCheckoutPath, '.claude/skills/review-code/SKILL.md', 'trusted skill');

    const result = await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    expect(result.status).toBe('ok');
    const copied = join(worktreePath, '.claude/skills/review-code/SKILL.md');
    expect(readFileSync(copied, 'utf-8')).toBe('trusted skill');
  });

  it('overwrites a skill the branch tampered with', async () => {
    writeAsset(sourceCheckoutPath, '.claude/skills/review-code/SKILL.md', 'trusted skill');
    writeAsset(worktreePath, '.claude/skills/review-code/SKILL.md', 'weakened skill');

    await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    const synced = join(worktreePath, '.claude/skills/review-code/SKILL.md');
    expect(readFileSync(synced, 'utf-8')).toBe('trusted skill');
  });

  it('removes a skill the branch injected that the source checkout does not have', async () => {
    writeAsset(sourceCheckoutPath, '.claude/skills/review-code/SKILL.md', 'trusted skill');
    writeAsset(worktreePath, '.claude/skills/backdoor/SKILL.md', 'injected skill');

    await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    expect(existsSync(join(worktreePath, '.claude/skills/backdoor'))).toBe(false);
    expect(existsSync(join(worktreePath, '.claude/skills/review-code/SKILL.md'))).toBe(true);
  });

  it('syncs agents and commands the same way as skills', async () => {
    writeAsset(sourceCheckoutPath, '.claude/agents/reviewer.md', 'trusted agent');
    writeAsset(worktreePath, '.claude/agents/rogue.md', 'injected agent');
    writeAsset(worktreePath, '.claude/commands/rogue.md', 'injected command');

    await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    expect(readFileSync(join(worktreePath, '.claude/agents/reviewer.md'), 'utf-8')).toBe(
      'trusted agent',
    );
    expect(existsSync(join(worktreePath, '.claude/agents/rogue.md'))).toBe(false);
    expect(existsSync(join(worktreePath, '.claude/commands'))).toBe(false);
  });

  it('clears branch-provided assets when the source checkout has no .claude directory', async () => {
    writeAsset(worktreePath, '.claude/skills/backdoor/SKILL.md', 'injected skill');

    const result = await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    expect(result.status).toBe('ok');
    expect(existsSync(join(worktreePath, '.claude/skills'))).toBe(false);
  });

  it('does not copy unrelated .claude content such as reviews tracking data', async () => {
    writeAsset(sourceCheckoutPath, '.claude/reviews/stats.json', '{}');
    writeAsset(sourceCheckoutPath, '.claude/skills/review-code/SKILL.md', 'trusted skill');

    await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    expect(existsSync(join(worktreePath, '.claude/reviews'))).toBe(false);
  });

  it('returns failed when the copy cannot be performed', async () => {
    writeAsset(sourceCheckoutPath, '.claude/skills/review-code/SKILL.md', 'trusted skill');
    rmSync(worktreePath, { recursive: true, force: true });
    writeFileSync(worktreePath, 'not a directory');

    const result = await syncTrustedClaudeAssets(worktreePath as WorktreePath, sourceCheckoutPath);

    expect(result.status).toBe('failed');
  });
});
