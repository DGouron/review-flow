import { describe, it, expect } from 'vitest';

import { parseSessionCompletion } from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.guard.js';

describe('SessionCompletion entity', () => {
  it('parses a valid MCP completion event', () => {
    const completion = parseSessionCompletion({
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });

    expect(completion.source).toBe('mcp');
    expect(completion.outcome).toBe('completed');
  });

  it('parses a polling completion event with reason', () => {
    const completion = parseSessionCompletion({
      source: 'polling',
      outcome: 'failed',
      reason: 'agent reported failed',
    });

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('failed');
    expect(completion.reason).toBe('agent reported failed');
  });

  it('rejects an invalid source', () => {
    expect(() =>
      parseSessionCompletion({ source: 'unknown', outcome: 'completed', reason: null }),
    ).toThrow();
  });
});
