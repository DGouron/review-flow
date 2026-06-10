import { describe, it, expect } from 'vitest';

import { buildLanguageDirective } from '@/frameworks/claude/languageDirective.js';

describe('buildLanguageDirective', () => {
  it('should return a French output directive when language is "fr"', () => {
    const directive = buildLanguageDirective('fr');
    expect(directive).toContain('French');
  });

  it('should return an English output directive when language is "en"', () => {
    const directive = buildLanguageDirective('en');
    expect(directive).toContain('English');
  });
});
