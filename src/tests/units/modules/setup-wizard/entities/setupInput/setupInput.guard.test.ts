import { describe, it, expect } from 'vitest';

import { setupInputGuard } from '@/modules/setup-wizard/entities/setupInput/setupInput.guard.js';

describe('setupInputGuard', () => {
  it('accepts a text input with a string value', () => {
    expect(setupInputGuard.safeParse({ kind: 'text', value: '/home/u/api' }).success).toBe(true);
  });

  it('accepts a confirm input with a boolean value', () => {
    expect(setupInputGuard.safeParse({ kind: 'confirm', value: true }).success).toBe(true);
  });

  it('accepts a choice input with a string value', () => {
    expect(setupInputGuard.safeParse({ kind: 'choice', value: 'backend' }).success).toBe(true);
  });

  it('accepts a multiSelect input with a string array value', () => {
    expect(setupInputGuard.safeParse({ kind: 'multiSelect', value: ['solid'] }).success).toBe(true);
  });

  it('rejects a confirm input whose value is not a boolean', () => {
    expect(setupInputGuard.safeParse({ kind: 'confirm', value: 'yes' }).success).toBe(false);
  });

  it('rejects a multiSelect input whose value is not an array of strings', () => {
    expect(setupInputGuard.safeParse({ kind: 'multiSelect', value: 'solid' }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(setupInputGuard.safeParse({ kind: 'slider', value: '1' }).success).toBe(false);
  });
});
