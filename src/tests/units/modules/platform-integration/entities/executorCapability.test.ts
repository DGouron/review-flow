import { describe, it, expect } from 'vitest';

import {
  EXECUTOR_CAPABILITY_TABLE,
  AUTO_EXECUTOR_CAPABILITIES,
  type ExecutorCapability,
} from '@/modules/platform-integration/entities/executorToken/executorCapability.js';

describe('executor capability table (AC5)', () => {
  it('declares the minimal role per action in a single exported constant', () => {
    expect(EXECUTOR_CAPABILITY_TABLE).toEqual({
      readMr: { minRole: 'reporter', autoPath: true },
      postComment: { minRole: 'reporter', autoPath: true },
      threadResolve: { minRole: 'developer', autoPath: false },
      revoke: { minRole: 'developer', autoPath: false },
    });
  });

  it('exposes the auto-path capability set as exactly {readMr, postComment}', () => {
    const sorted = [...AUTO_EXECUTOR_CAPABILITIES].toSorted();
    expect(sorted).toEqual<ExecutorCapability[]>(['postComment', 'readMr']);
  });

  it('excludes every non-auto-path action from the auto capability set', () => {
    expect(AUTO_EXECUTOR_CAPABILITIES.has('threadResolve')).toBe(false);
    expect(AUTO_EXECUTOR_CAPABILITIES.has('revoke')).toBe(false);
  });

  it('derives the auto set strictly from the table autoPath flags', () => {
    const derived = Object.entries(EXECUTOR_CAPABILITY_TABLE)
      .filter(([, capability]) => capability.autoPath)
      .map(([name]) => name)
      .toSorted();
    expect(derived).toEqual(['postComment', 'readMr']);
  });
});
