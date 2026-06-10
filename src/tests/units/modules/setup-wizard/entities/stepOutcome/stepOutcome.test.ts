import { describe, it, expect } from 'vitest';

import {
  skipped,
  succeeded,
  blocked,
  warning,
  isFinalSuccess,
  isBlocking,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';

describe('stepOutcome constructors', () => {
  it('skipped() produces a skipped outcome with optional message', () => {
    const outcome = skipped('already done');
    expect(outcome.status).toBe('skipped');
    expect(outcome.message).toBe('already done');
    expect(outcome.remediation).toBeNull();
  });

  it('succeeded() produces a succeeded outcome', () => {
    const outcome = succeeded();
    expect(outcome.status).toBe('succeeded');
  });

  it('blocked() requires a message and remediation', () => {
    const outcome = blocked('Claude CLI manquant', 'Installez Claude CLI');
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toBe('Claude CLI manquant');
    expect(outcome.remediation).toBe('Installez Claude CLI');
  });

  it('warning() produces a warning outcome', () => {
    const outcome = warning('glab not installed');
    expect(outcome.status).toBe('warning');
  });

  it('isFinalSuccess() returns true for succeeded, skipped, warning', () => {
    expect(isFinalSuccess(succeeded())).toBe(true);
    expect(isFinalSuccess(skipped())).toBe(true);
    expect(isFinalSuccess(warning('w'))).toBe(true);
    expect(isFinalSuccess(blocked('m', 'r'))).toBe(false);
  });

  it('isBlocking() returns true only for blocked', () => {
    expect(isBlocking(blocked('m', 'r'))).toBe(true);
    expect(isBlocking(succeeded())).toBe(false);
  });
});
