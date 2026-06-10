import { describe, it, expect } from 'vitest';

import { languageSchema } from '@/modules/shared-kernel/entities/language/language.schema.js';

describe('Language schema', () => {
  it('should accept "en" as a valid language', () => {
    const result = languageSchema.safeParse('en');
    expect(result.success).toBe(true);
  });

  it('should accept "fr" as a valid language', () => {
    const result = languageSchema.safeParse('fr');
    expect(result.success).toBe(true);
  });

  it('should reject an unsupported language', () => {
    const result = languageSchema.safeParse('de');
    expect(result.success).toBe(false);
  });
});
