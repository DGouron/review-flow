import { describe, it, expect } from 'vitest';

import { ReviewProgressMemoryGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewProgress.memory.gateway.js';
import { setPhase } from '@/modules/review-execution/usecases/mcp/setPhase.usecase.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';

describe('setPhase usecase', () => {
  it('should set phase to agents-running and return success', () => {
    const gateway = new ReviewProgressMemoryGateway();
    gateway.createProgress('job-1', ['ddd']);

    const result = setPhase('job-1', 'agents-running', { progressGateway: gateway });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.phase).toBe('agents-running');
    }
  });

  it('should set phase to completed', () => {
    const gateway = new ReviewProgressMemoryGateway();
    gateway.createProgress('job-1', ['ddd']);

    const result = setPhase('job-1', 'completed', { progressGateway: gateway });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.phase).toBe('completed');
    }
  });

  it('should return error when job does not exist', () => {
    const gateway = new ReviewProgressMemoryGateway();

    const result = setPhase('unknown-job', 'agents-running', { progressGateway: gateway });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });

  it('should return updated overallProgress', () => {
    const gateway = new ReviewProgressMemoryGateway();
    gateway.createProgress('job-1', ['ddd']);

    const result = setPhase('job-1', 'completed', { progressGateway: gateway });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.overallProgress).toBeDefined();
    }
  });

  it('publishes a completion event on the MCP completion bridge when phase becomes completed', () => {
    const gateway = new ReviewProgressMemoryGateway();
    gateway.createProgress('job-1', ['ddd']);
    const bridge = new StubMcpCompletionBridge();
    const captured: Array<{ source: string; outcome: string }> = [];
    bridge.subscribe('job-1', (completion) => {
      captured.push({ source: completion.source, outcome: completion.outcome });
    });

    setPhase('job-1', 'completed', { progressGateway: gateway, completionBridge: bridge });

    expect(captured).toEqual([{ source: 'mcp', outcome: 'completed' }]);
  });

  it('does not publish on the completion bridge for non-terminal phases', () => {
    const gateway = new ReviewProgressMemoryGateway();
    gateway.createProgress('job-1', ['ddd']);
    const bridge = new StubMcpCompletionBridge();
    const captured: string[] = [];
    bridge.subscribe('job-1', (c) => captured.push(c.outcome));

    setPhase('job-1', 'agents-running', { progressGateway: gateway, completionBridge: bridge });

    expect(captured).toEqual([]);
  });
});
