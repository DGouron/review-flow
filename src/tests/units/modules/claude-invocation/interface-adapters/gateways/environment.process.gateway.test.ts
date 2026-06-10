import { describe, it, expect } from 'vitest';

import { ProcessEnvironmentGateway } from '@/modules/claude-invocation/interface-adapters/gateways/environment.process.gateway.js';

describe('ProcessEnvironmentGateway', () => {
  it('returns true when ANTHROPIC_API_KEY is set in the provided env source', () => {
    const gateway = new ProcessEnvironmentGateway(() => ({ ANTHROPIC_API_KEY: 'sk-xxx' }));

    expect(gateway.hasAnthropicApiKey()).toBe(true);
  });

  it('returns false when ANTHROPIC_API_KEY is absent', () => {
    const gateway = new ProcessEnvironmentGateway(() => ({}));

    expect(gateway.hasAnthropicApiKey()).toBe(false);
  });

  it('returns false when ANTHROPIC_API_KEY is an empty string', () => {
    const gateway = new ProcessEnvironmentGateway(() => ({ ANTHROPIC_API_KEY: '' }));

    expect(gateway.hasAnthropicApiKey()).toBe(false);
  });
});
