import { describe, it, expect } from 'vitest';

import { triggerModeSchema } from '@/modules/shared-kernel/entities/triggerMode/triggerMode.schema.js';

describe('triggerModeSchema', () => {
  it('accepts full-auto', () => {
    expect(triggerModeSchema.parse('full-auto')).toBe('full-auto');
  });

  it('accepts semi-auto', () => {
    expect(triggerModeSchema.parse('semi-auto')).toBe('semi-auto');
  });

  it('rejects an unknown trigger mode', () => {
    expect(triggerModeSchema.safeParse('manual').success).toBe(false);
  });
});
