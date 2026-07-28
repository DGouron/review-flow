import { describe, it, expect, afterEach } from 'vitest';

import {
  setReviewTimeoutMinutes,
  __resetForTestsOnly,
} from '@/frameworks/settings/runtimeSettings.js';
import { applyPersistedReviewTimeout } from '@/main/dependencies.js';

describe('applyPersistedReviewTimeout', () => {
  afterEach(() => {
    __resetForTestsOnly();
  });

  it('overwrites the boot-time invocation timeout with the persisted value', async () => {
    const invocationDeps = { timeoutMs: 15 * 60 * 1000 };
    await setReviewTimeoutMinutes(120);

    applyPersistedReviewTimeout(invocationDeps);

    expect(invocationDeps.timeoutMs).toBe(120 * 60 * 1000);
  });

  it('keeps the default when no persisted value was loaded', () => {
    const invocationDeps = { timeoutMs: 0 };

    applyPersistedReviewTimeout(invocationDeps);

    expect(invocationDeps.timeoutMs).toBe(15 * 60 * 1000);
  });
});
