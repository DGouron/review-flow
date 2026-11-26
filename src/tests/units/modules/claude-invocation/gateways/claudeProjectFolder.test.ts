import { describe, it, expect } from 'vitest';

import { claudeProjectFolderOf } from '@/modules/claude-invocation/interface-adapters/gateways/claudeProjectFolder.js';

describe('claudeProjectFolderOf', () => {
  it('turns every slash into a dash', () => {
    expect(claudeProjectFolderOf('/home/ai/practivizio-app')).toBe('-home-ai-practivizio-app');
  });

  it('turns dots, underscores and spaces into dashes, like Claude Code does', () => {
    expect(claudeProjectFolderOf('/Users/me/.claude/my_project v2')).toBe(
      '-Users-me--claude-my-project-v2',
    );
  });
});
