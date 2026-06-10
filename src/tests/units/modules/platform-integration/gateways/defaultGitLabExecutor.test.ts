import { describe, it, expect, afterEach, vi } from 'vitest';

import { defaultGitLabExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { MissingExecutorTokenError } from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';

describe('defaultGitLabExecutor fail-closed (AC1 production wiring)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws MissingExecutorTokenError when the service token is unset, never falling back to the ambient token', () => {
    vi.stubEnv('REVIEWFLOW_EXECUTOR_TOKEN', '');
    expect(() => defaultGitLabExecutor('glab api projects/x/merge_requests/1/discussions')).toThrow(
      MissingExecutorTokenError,
    );
  });
});
