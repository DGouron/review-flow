import { describe, it, expect } from 'vitest';

import {
  supervisorStatusSchema,
  type SupervisorStatus,
} from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';

describe('supervisorStatus schema', () => {
  it('accepts a known state with null reason and a Date checkpoint', () => {
    const candidate: SupervisorStatus = {
      state: 'up',
      reason: null,
      lastCheckedAt: new Date('2026-05-23T08:00:00Z'),
    };

    const parsed = supervisorStatusSchema.parse(candidate);

    expect(parsed.state).toBe('up');
    expect(parsed.reason).toBeNull();
    expect(parsed.lastCheckedAt.toISOString()).toBe('2026-05-23T08:00:00.000Z');
  });

  it('accepts a down state with a reason string', () => {
    const parsed = supervisorStatusSchema.parse({
      state: 'down',
      reason: 'supervisor-spawn-failed',
      lastCheckedAt: new Date('2026-05-23T08:00:00Z'),
    });

    expect(parsed.state).toBe('down');
    expect(parsed.reason).toBe('supervisor-spawn-failed');
  });

  it('rejects an unknown state value', () => {
    expect(() =>
      supervisorStatusSchema.parse({
        state: 'maybe',
        reason: null,
        lastCheckedAt: new Date(),
      }),
    ).toThrow();
  });
});
