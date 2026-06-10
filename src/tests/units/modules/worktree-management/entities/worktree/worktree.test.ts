import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  createWorktreePath,
  deriveWorktreeSlug,
  deriveWorktreeDirectoryName,
  deriveWorktreePath,
  deriveFetchRef,
  parseWorktreeDirectoryName,
} from '@/modules/worktree-management/entities/worktree/worktree.js';

describe('worktree entity helpers', () => {
  describe('createWorktreePath', () => {
    it('returns the value for a valid absolute path', () => {
      const path = createWorktreePath('/home/damien/.reviewflow/worktrees/gitlab-x-1');
      expect(path).toBe('/home/damien/.reviewflow/worktrees/gitlab-x-1');
    });

    it('throws on an empty string', () => {
      expect(() => createWorktreePath('')).toThrow(
        'Invalid worktree path (must be absolute, non-empty): ',
      );
    });

    it('throws on a relative (non-absolute) path', () => {
      expect(() => createWorktreePath('relative/path')).toThrow(
        'Invalid worktree path (must be absolute, non-empty): relative/path',
      );
    });
  });

  describe('deriveWorktreeDirectoryName', () => {
    it('joins platform, slugged project path, and mr number', () => {
      expect(
        deriveWorktreeDirectoryName({
          platform: 'gitlab',
          projectPath: 'group/project',
          mrNumber: 42,
        }),
      ).toBe('gitlab-group-project-42');
    });
  });

  describe('parseWorktreeDirectoryName', () => {
    it('parses a gitlab directory name', () => {
      expect(parseWorktreeDirectoryName('gitlab-group-project-42')).toEqual({
        platform: 'gitlab',
        projectPath: 'group-project',
        mrNumber: 42,
      });
    });

    it('parses a github directory name', () => {
      expect(parseWorktreeDirectoryName('github-owner-repo-17')).toEqual({
        platform: 'github',
        projectPath: 'owner-repo',
        mrNumber: 17,
      });
    });

    it('returns null when the name does not match the pattern', () => {
      expect(parseWorktreeDirectoryName('bitbucket-owner-repo-17')).toBeNull();
    });

    it('returns null when there is no trailing mr number', () => {
      expect(parseWorktreeDirectoryName('gitlab-project')).toBeNull();
    });

    it('returns null when the mr number is zero', () => {
      expect(parseWorktreeDirectoryName('gitlab-project-0')).toBeNull();
    });
  });

  describe('deriveWorktreeSlug', () => {
    it('replaces slashes with dashes', () => {
      expect(deriveWorktreeSlug('group/project')).toBe('group-project');
    });

    it('keeps single-segment paths intact', () => {
      expect(deriveWorktreeSlug('project')).toBe('project');
    });

    it('handles nested groups', () => {
      expect(deriveWorktreeSlug('group/subgroup/project')).toBe('group-subgroup-project');
    });
  });

  describe('deriveWorktreePath', () => {
    it('builds the canonical path under WORKTREE_BASE_DIR', () => {
      const path = deriveWorktreePath({
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 4242,
      });
      expect(path).toBe(join(homedir(), '.reviewflow', 'worktrees', 'gitlab-group-project-4242'));
    });

    it('supports github platform', () => {
      const path = deriveWorktreePath({
        platform: 'github',
        projectPath: 'owner/repo',
        mrNumber: 17,
      });
      expect(path).toBe(join(homedir(), '.reviewflow', 'worktrees', 'github-owner-repo-17'));
    });
  });

  describe('deriveFetchRef', () => {
    it('returns origin refspec for same-repo MR (kind=origin)', () => {
      const ref = deriveFetchRef({ kind: 'origin' }, 'feat/new-thing', 99);
      expect(ref).toEqual({
        remote: 'origin',
        refspec: 'feat/new-thing',
        worktreeRef: 'origin/feat/new-thing',
      });
    });

    it('returns fork URL refspec for cross-fork PR (kind=fork)', () => {
      const ref = deriveFetchRef(
        { kind: 'fork', cloneUrl: 'https://github.com/contributor/fork.git' },
        'patch-1',
        99,
      );
      expect(ref).toEqual({
        remote: 'https://github.com/contributor/fork.git',
        refspec: 'patch-1:refs/remotes/pr-99/head',
        worktreeRef: 'refs/remotes/pr-99/head',
      });
    });
  });
});
