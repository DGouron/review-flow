import { describe, it, expect } from 'vitest';

import { resolveProjectIdentifier } from '@/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.js';

describe('resolveProjectIdentifier', () => {
  it('resolves an SSH GitLab remote to its namespace', () => {
    expect(resolveProjectIdentifier('git@gitlab.com:group/proj.git')).toBe('group/proj');
  });

  it('resolves an HTTPS GitLab remote to its namespace', () => {
    expect(resolveProjectIdentifier('https://gitlab.com/group/proj.git')).toBe('group/proj');
  });

  it('preserves nested GitLab groups', () => {
    expect(resolveProjectIdentifier('git@gitlab.com:group/sub/proj.git')).toBe('group/sub/proj');
  });

  it('resolves an SSH GitHub remote to owner/repo', () => {
    expect(resolveProjectIdentifier('git@github.com:owner/repo.git')).toBe('owner/repo');
  });

  it('resolves an HTTPS GitHub remote without a .git suffix', () => {
    expect(resolveProjectIdentifier('https://github.com/owner/repo')).toBe('owner/repo');
  });

  it('strips a self-hosted host', () => {
    expect(resolveProjectIdentifier('git@gitlab.example.com:org/proj.git')).toBe('org/proj');
  });

  it('returns null for an unparseable string', () => {
    expect(resolveProjectIdentifier('not-a-url')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(resolveProjectIdentifier('')).toBeNull();
  });
});
