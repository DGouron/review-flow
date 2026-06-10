import { describe, it, expect } from 'vitest';

import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';

describe('BackfillProgress', () => {
  it('should represent an idle backfill progress', () => {
    const progress: BackfillProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      status: 'idle',
    };

    expect(progress.total).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.failed).toBe(0);
    expect(progress.status).toBe('idle');
  });

  it('should represent a running backfill progress', () => {
    const progress: BackfillProgress = {
      total: 10,
      completed: 3,
      failed: 1,
      status: 'running',
    };

    expect(progress.total).toBe(10);
    expect(progress.completed).toBe(3);
    expect(progress.failed).toBe(1);
    expect(progress.status).toBe('running');
  });

  it('should represent a completed backfill progress', () => {
    const progress: BackfillProgress = {
      total: 10,
      completed: 10,
      failed: 2,
      status: 'completed',
    };

    expect(progress.total).toBe(10);
    expect(progress.completed).toBe(10);
    expect(progress.failed).toBe(2);
    expect(progress.status).toBe('completed');
  });
});
