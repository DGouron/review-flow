import { describe, it, expect } from 'vitest';

import {
  developerTitleSchema,
  DEVELOPER_TITLES,
} from '@/modules/statistics-insights/entities/insight/developerTitle.js';

describe('DeveloperTitle', () => {
  it('should define six developer titles', () => {
    expect(DEVELOPER_TITLES).toEqual([
      'architect',
      'firefighter',
      'workhorse',
      'sentinel',
      'polyvalent',
      'risingStar',
    ]);
  });

  it('should validate a valid title', () => {
    const result = developerTitleSchema.safeParse('architect');

    expect(result.success).toBe(true);
  });

  it('should reject an invalid title', () => {
    const result = developerTitleSchema.safeParse('wizard');

    expect(result.success).toBe(false);
  });
});
