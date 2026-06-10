import { describe, it, expect, vi } from 'vitest';

import { InMemoryMcpCompletionBridge } from '@/modules/claude-invocation/interface-adapters/gateways/mcpCompletion.memory.gateway.js';

describe('InMemoryMcpCompletionBridge', () => {
  it('delivers a published completion to the matching listener', () => {
    const bridge = new InMemoryMcpCompletionBridge();
    const listener = vi.fn();

    bridge.subscribe('job-1', listener);
    bridge.publish('job-1', { source: 'mcp', outcome: 'completed', reason: null });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });
  });

  it('does not deliver to listeners of other job ids', () => {
    const bridge = new InMemoryMcpCompletionBridge();
    const listener = vi.fn();

    bridge.subscribe('job-1', listener);
    bridge.publish('job-2', { source: 'mcp', outcome: 'completed', reason: null });

    expect(listener).not.toHaveBeenCalled();
  });

  it('drops listeners after unsubscribe', () => {
    const bridge = new InMemoryMcpCompletionBridge();
    const listener = vi.fn();

    bridge.subscribe('job-1', listener);
    bridge.unsubscribe('job-1');
    bridge.publish('job-1', { source: 'mcp', outcome: 'completed', reason: null });

    expect(listener).not.toHaveBeenCalled();
  });

  it('replays a completion published before the subscribe call', () => {
    const bridge = new InMemoryMcpCompletionBridge();
    const listener = vi.fn();

    bridge.publish('job-1', { source: 'mcp', outcome: 'completed', reason: null });
    bridge.subscribe('job-1', listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
