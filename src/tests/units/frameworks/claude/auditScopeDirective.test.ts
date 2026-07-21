import { describe, it, expect } from 'vitest';

import { buildAuditScopeDirective } from '@/frameworks/claude/auditScopeDirective.js';

describe('buildAuditScopeDirective', () => {
  it('returns an empty string when the scope is empty', () => {
    expect(buildAuditScopeDirective([])).toBe('');
  });

  it('names every resolved principle in the directive', () => {
    const directive = buildAuditScopeDirective([
      { name: 'solid', displayName: 'SOLID' },
      { name: 'testing', displayName: 'Testing' },
    ]);

    expect(directive).toContain('solid');
    expect(directive).toContain('testing');
  });

  it('declares itself authoritative and instructs to skip out-of-scope principles', () => {
    const directive = buildAuditScopeDirective([{ name: 'solid', displayName: 'SOLID' }]);

    expect(directive.toUpperCase()).toContain('AUTHORITATIVE');
    expect(directive.toLowerCase()).toContain('skip');
    expect(directive).toContain('REVIEW AUDIT SCOPE');
  });

  it('does not leak principles that are absent from the scope', () => {
    const directive = buildAuditScopeDirective([{ name: 'solid', displayName: 'SOLID' }]);

    expect(directive).not.toContain('clean-architecture');
  });
});
