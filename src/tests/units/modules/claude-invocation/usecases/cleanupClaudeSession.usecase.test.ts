import { describe, it, expect } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';

describe('cleanupClaudeSession use case', () => {
  it('stops and removes the session on the happy path', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    const sessionId = parseSessionId('clean001');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(true);
    expect(result.removed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(sessionGateway.stopCalls).toContain(sessionId);
    expect(sessionGateway.removeCalls).toContain(sessionId);
  });

  it('records a stop warning when stop fails with a warning', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setStopResult({ success: false, warning: 'not running' });
    const sessionId = parseSessionId('clean002');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(false);
    expect(result.removed).toBe(true);
    expect(result.warnings).toEqual(['stop: not running']);
  });

  it('records a remove warning when remove fails with a warning', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setRemoveResult({ success: false, warning: 'still present' });
    const sessionId = parseSessionId('clean003');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(true);
    expect(result.removed).toBe(false);
    expect(result.warnings).toEqual(['remove: still present']);
  });

  it('does not record a warning when a step fails without a warning message', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setStopResult({ success: false, warning: null });
    const sessionId = parseSessionId('clean004');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(false);
    expect(result.removed).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('captures the message when stop throws an Error', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setStopError(new Error('daemon unreachable'));
    const sessionId = parseSessionId('clean005');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(false);
    expect(result.removed).toBe(true);
    expect(result.warnings).toEqual([
      'stop failed: daemon unreachable',
      'stop: daemon unreachable',
    ]);
  });

  it('stringifies the value when remove throws a non-Error', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setRemoveError('boom');
    const sessionId = parseSessionId('clean006');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(true);
    expect(result.removed).toBe(false);
    expect(result.warnings).toEqual(['remove failed: boom', 'remove: boom']);
  });

  it('accumulates warnings from both stop and remove failures', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setStopError(new Error('stop blew up'));
    sessionGateway.setRemoveResult({ success: false, warning: 'cannot delete' });
    const sessionId = parseSessionId('clean007');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(false);
    expect(result.removed).toBe(false);
    expect(result.warnings).toEqual([
      'stop failed: stop blew up',
      'stop: stop blew up',
      'remove: cannot delete',
    ]);
  });
});
