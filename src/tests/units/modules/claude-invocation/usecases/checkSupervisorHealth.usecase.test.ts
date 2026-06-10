import { describe, it, expect } from 'vitest';

import { checkSupervisorHealth } from '@/modules/claude-invocation/usecases/checkSupervisorHealth.usecase.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubSupervisorHealthGateway } from '@/tests/stubs/supervisorHealth.stub.js';

describe('checkSupervisorHealth use case', () => {
  it('records the supervisor as up when daemon is reachable', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDaemonStatus({ reachable: true, reason: null });
    const supervisorHealthGateway = new StubSupervisorHealthGateway();

    const result = await checkSupervisorHealth({
      sessionGateway,
      supervisorHealthGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('up');
    expect(supervisorHealthGateway.read().lastCheckAt).toBe('2026-05-22T10:00:00.000Z');
  });

  it('records the supervisor as down when daemon is unreachable', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDaemonStatus({ reachable: false, reason: 'connection refused' });
    const supervisorHealthGateway = new StubSupervisorHealthGateway();

    const result = await checkSupervisorHealth({
      sessionGateway,
      supervisorHealthGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('down');
    expect(result.lastDownReason).toBe('connection refused');
  });
});
