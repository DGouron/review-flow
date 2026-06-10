import { describe, it, expect } from 'vitest';

import { GatewayError } from '@/shared/foundation/gatewayError.js';

describe('GatewayError', () => {
  it('is an instance of Error with the GatewayError name', () => {
    const error = new GatewayError('GitLab API timeout');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GatewayError');
    expect(error.message).toBe('GitLab API timeout');
  });

  it('stores optional extensions metadata', () => {
    const error = new GatewayError('GitLab rejected', {
      status: 403,
      endpoint: '/api/v4/projects/42',
    });
    expect(error.extensions).toEqual({
      status: 403,
      endpoint: '/api/v4/projects/42',
    });
  });

  it('leaves extensions undefined when none provided', () => {
    const error = new GatewayError('boom');
    expect(error.extensions).toBeUndefined();
  });
});
