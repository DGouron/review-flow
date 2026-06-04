import { describe, it, expect } from 'vitest';
import { ClaudeAuthCliGateway } from '@/modules/setup-wizard/interface-adapters/gateways/claudeAuth.cli.gateway.js';

function recordingExecutor(responses: Record<string, string>, calls: string[]) {
  return (command: string): string => {
    calls.push(command);
    if (command in responses) {
      return responses[command];
    }
    throw new Error(`command not found: ${command}`);
  };
}

describe('ClaudeAuthCliGateway.isLoggedIn', () => {
  it('reports logged in when "claude auth status" returns loggedIn true', async () => {
    const calls: string[] = [];
    const gateway = new ClaudeAuthCliGateway({
      executeCommand: recordingExecutor(
        {
          'claude --version': '2.1.160 (Claude Code)',
          'claude auth status': JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }),
        },
        calls,
      ),
    });

    expect(await gateway.isLoggedIn()).toBe(true);
    expect(calls).toContain('claude auth status');
  });

  it('reports logged out when "claude auth status" returns loggedIn false', async () => {
    const gateway = new ClaudeAuthCliGateway({
      executeCommand: recordingExecutor(
        {
          'claude --version': '2.1.160 (Claude Code)',
          'claude auth status': JSON.stringify({ loggedIn: false }),
        },
        [],
      ),
    });

    expect(await gateway.isLoggedIn()).toBe(false);
  });

  it('reports logged out when the auth status command fails', async () => {
    const gateway = new ClaudeAuthCliGateway({
      executeCommand: recordingExecutor({ 'claude --version': '2.1.160 (Claude Code)' }, []),
    });

    expect(await gateway.isLoggedIn()).toBe(false);
  });

  it('never invokes the interactive "claude /status" command', async () => {
    const calls: string[] = [];
    const gateway = new ClaudeAuthCliGateway({
      executeCommand: recordingExecutor(
        {
          'claude --version': '2.1.160 (Claude Code)',
          'claude auth status': JSON.stringify({ loggedIn: true }),
        },
        calls,
      ),
    });

    await gateway.isLoggedIn();
    expect(calls).not.toContain('claude /status');
  });
});
