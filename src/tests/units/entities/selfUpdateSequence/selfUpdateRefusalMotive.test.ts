import { describe, it, expect } from 'vitest';

import type { SelfUpdateRefusalMotive } from '@/modules/cli-configuration/entities/selfUpdateSequence/selfUpdateRefusalMotive.js';

describe('SelfUpdateRefusalMotive type', () => {
  it('should represent a local-only refusal', () => {
    const motive: SelfUpdateRefusalMotive = { kind: 'local-only' };

    expect(motive.kind).toBe('local-only');
  });

  it('should represent a reviews-in-progress refusal with a count', () => {
    const motive: SelfUpdateRefusalMotive = { kind: 'reviews-in-progress', count: 2 };

    expect(motive.kind).toBe('reviews-in-progress');
    expect(motive.count).toBe(2);
  });

  it('should represent a wrong-branch refusal', () => {
    const motive: SelfUpdateRefusalMotive = { kind: 'wrong-branch' };

    expect(motive.kind).toBe('wrong-branch');
  });

  it('should represent a dirty-checkout refusal', () => {
    const motive: SelfUpdateRefusalMotive = { kind: 'dirty-checkout' };

    expect(motive.kind).toBe('dirty-checkout');
  });

  it('should represent a missing-tool refusal naming the missing tool', () => {
    const motive: SelfUpdateRefusalMotive = { kind: 'missing-tool', tool: 'yarn' };

    expect(motive.kind).toBe('missing-tool');
    expect(motive.tool).toBe('yarn');
  });

  it('should represent a fetch-failed refusal carrying the untranslated detail', () => {
    const motive: SelfUpdateRefusalMotive = {
      kind: 'fetch-failed',
      detail: 'fatal: no remote branch configured',
    };

    expect(motive.kind).toBe('fetch-failed');
    expect(motive.detail).toBe('fatal: no remote branch configured');
  });

  it('should represent a rebuild-failed refusal', () => {
    const motive: SelfUpdateRefusalMotive = { kind: 'rebuild-failed' };

    expect(motive.kind).toBe('rebuild-failed');
  });
});
