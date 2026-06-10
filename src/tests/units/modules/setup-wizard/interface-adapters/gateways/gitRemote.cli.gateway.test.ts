import { describe, it, expect } from 'vitest';

import { GitRemoteCliGateway } from '@/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.js';

describe('GitRemoteCliGateway.detectPlatform', () => {
  const gateway = new GitRemoteCliGateway();

  it('detects github from github.com SSH URLs', () => {
    expect(gateway.detectPlatform('git@github.com:org/repo.git')).toBe('github');
  });

  it('detects github from https URLs', () => {
    expect(gateway.detectPlatform('https://github.com/org/repo')).toBe('github');
  });

  it('detects gitlab from gitlab.com URLs', () => {
    expect(gateway.detectPlatform('git@gitlab.com:org/repo.git')).toBe('gitlab');
  });

  it('detects gitlab from self-hosted gitlab. subdomain', () => {
    expect(gateway.detectPlatform('git@gitlab.example.com:org/repo.git')).toBe('gitlab');
  });

  it('returns unknown for custom remotes', () => {
    expect(gateway.detectPlatform('git@bitbucket.org:org/repo.git')).toBe('unknown');
  });
});
