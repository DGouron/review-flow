import { describe, it, expect } from 'vitest';

import {
  MEMBER_ACCESS_LEVELS,
  isDeveloperOrAbove,
} from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';

describe('isDeveloperOrAbove', () => {
  it('treats Developer and above as trusted', () => {
    expect(isDeveloperOrAbove(MEMBER_ACCESS_LEVELS.developer)).toBe(true);
    expect(isDeveloperOrAbove(MEMBER_ACCESS_LEVELS.maintainer)).toBe(true);
    expect(isDeveloperOrAbove(MEMBER_ACCESS_LEVELS.owner)).toBe(true);
  });

  it('treats below Developer as non-trusted', () => {
    expect(isDeveloperOrAbove(MEMBER_ACCESS_LEVELS.reporter)).toBe(false);
    expect(isDeveloperOrAbove(MEMBER_ACCESS_LEVELS.guest)).toBe(false);
    expect(isDeveloperOrAbove(MEMBER_ACCESS_LEVELS.noAccess)).toBe(false);
  });

  it('treats an unresolved actor (null) as non-trusted', () => {
    expect(isDeveloperOrAbove(null)).toBe(false);
  });
});
