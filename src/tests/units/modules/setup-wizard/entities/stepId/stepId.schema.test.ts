import { describe, it, expect } from 'vitest';

import { stepIdSchema, STEP_IDS } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';

describe('stepIdSchema', () => {
  it('accepts every known step id', () => {
    for (const id of STEP_IDS) {
      expect(stepIdSchema.parse(id)).toBe(id);
    }
  });

  it('rejects unknown step ids', () => {
    expect(stepIdSchema.safeParse('unknown').success).toBe(false);
  });

  it('exposes the 10 expected setup steps', () => {
    expect(STEP_IDS).toHaveLength(10);
  });
});
