import { describe, it, expect } from 'vitest';

import { projectContextGuard } from '@/modules/setup-wizard/entities/projectContext/projectContext.guard.js';
import { ProjectContextFactory } from '@/tests/factories/projectContext.factory.js';

describe('projectContext', () => {
  it('accepts a valid project context', () => {
    const ctx = ProjectContextFactory.create();
    expect(projectContextGuard.isValid(ctx)).toBe(true);
  });

  it('accepts null values for partial context (used during step composition)', () => {
    const partial = {
      localPath: '/tmp/x',
      platform: null,
      preset: null,
      language: null,
      remoteUrl: null,
    };
    expect(projectContextGuard.isValid(partial)).toBe(true);
  });

  it('rejects unknown platform values', () => {
    const invalid = { ...ProjectContextFactory.create(), platform: 'bitbucket' };
    expect(projectContextGuard.isValid(invalid)).toBe(false);
  });
});
