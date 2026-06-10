import { describe, it, expect } from 'vitest';

import { parseBypassMarker } from '@/modules/tracking/entities/bypassMarker/bypassMarker.js';

describe('parseBypassMarker', () => {
  it('returns no-marker for an empty comment', () => {
    expect(parseBypassMarker('')).toEqual({ kind: 'no-marker' });
  });

  it('returns no-marker when the marker word is absent', () => {
    expect(parseBypassMarker('LGTM, ship it')).toEqual({ kind: 'no-marker' });
  });

  it('returns invalid-missing-reason for a bare /bypass-quality marker', () => {
    expect(parseBypassMarker('/bypass-quality')).toEqual({ kind: 'invalid-missing-reason' });
  });

  it('returns invalid-missing-reason when the quoted reason is empty', () => {
    expect(parseBypassMarker('/bypass-quality ""')).toEqual({ kind: 'invalid-missing-reason' });
  });

  it('returns invalid-missing-reason when the quoted reason is whitespace only', () => {
    expect(parseBypassMarker('/bypass-quality "   "')).toEqual({ kind: 'invalid-missing-reason' });
  });

  it('returns valid with the parsed reason for a well-formed marker', () => {
    expect(parseBypassMarker('/bypass-quality "hotfix critique"')).toEqual({
      kind: 'valid',
      reason: 'hotfix critique',
    });
  });

  it('returns valid when the marker is embedded mid-comment', () => {
    expect(parseBypassMarker('see notes: /bypass-quality "par précaution" please')).toEqual({
      kind: 'valid',
      reason: 'par précaution',
    });
  });
});
