import { describe, it, expect, beforeEach } from 'vitest';

import { MEMBER_ACCESS_LEVELS } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';
import { GitLabMemberAccessCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/memberAccess.gitlab.cli.gateway.js';

interface RecordedCommand {
  command: string;
}

class RecordingExecutor {
  public readonly commands: RecordedCommand[] = [];
  private responses = new Map<string, string>();
  private failures = new Set<string>();

  onMatch(fragment: string, response: string): void {
    this.responses.set(fragment, response);
  }

  failOnMatch(fragment: string): void {
    this.failures.add(fragment);
  }

  run = (command: string): string => {
    this.commands.push({ command });
    for (const fragment of this.failures) {
      if (command.includes(fragment)) {
        throw new Error(`glab failed for ${fragment}`);
      }
    }
    for (const [fragment, response] of this.responses) {
      if (command.includes(fragment)) {
        return response;
      }
    }
    throw new Error(`No stubbed response for command: ${command}`);
  };
}

describe('GitLabMemberAccessCliGateway', () => {
  let executor: RecordingExecutor;
  let now: number;
  const clock = (): number => now;

  beforeEach(() => {
    executor = new RecordingExecutor();
    now = 1_000;
  });

  function buildGateway(ttlMs = 60_000): GitLabMemberAccessCliGateway {
    return new GitLabMemberAccessCliGateway(executor.run, { ttlMs, clock });
  }

  it('resolves username to id then membership access level', async () => {
    executor.onMatch('users?username=alice', JSON.stringify([{ id: 7, username: 'alice' }]));
    executor.onMatch('members/all/7', JSON.stringify({ id: 7, access_level: 30 }));

    const accessLevel = await buildGateway().resolve('org/project', 'alice');

    expect(accessLevel).toBe(MEMBER_ACCESS_LEVELS.developer);
  });

  it('caches per username and does not re-query within the TTL', async () => {
    executor.onMatch('users?username=alice', JSON.stringify([{ id: 7, username: 'alice' }]));
    executor.onMatch('members/all/7', JSON.stringify({ id: 7, access_level: 40 }));

    const gateway = buildGateway();
    await gateway.resolve('org/project', 'alice');
    const commandsAfterFirst = executor.commands.length;
    await gateway.resolve('org/project', 'alice');

    expect(executor.commands.length).toBe(commandsAfterFirst);
  });

  it('does not apply a cached result for one username to another (AC5)', async () => {
    executor.onMatch('users?username=alice', JSON.stringify([{ id: 7, username: 'alice' }]));
    executor.onMatch('members/all/7', JSON.stringify({ id: 7, access_level: 30 }));
    executor.failOnMatch('users?username=mallory');

    const gateway = buildGateway();
    await gateway.resolve('org/project', 'alice');
    const mallory = await gateway.resolve('org/project', 'mallory');

    expect(mallory).toBeNull();
  });

  it('re-queries after the TTL expires', async () => {
    executor.onMatch('users?username=alice', JSON.stringify([{ id: 7, username: 'alice' }]));
    executor.onMatch('members/all/7', JSON.stringify({ id: 7, access_level: 30 }));

    const gateway = buildGateway(1_000);
    await gateway.resolve('org/project', 'alice');
    const commandsAfterFirst = executor.commands.length;
    now += 2_000;
    await gateway.resolve('org/project', 'alice');

    expect(executor.commands.length).toBeGreaterThan(commandsAfterFirst);
  });

  it('returns null when the user lookup throws (fail-closed)', async () => {
    executor.failOnMatch('users?username=alice');

    const accessLevel = await buildGateway().resolve('org/project', 'alice');

    expect(accessLevel).toBeNull();
  });

  it('returns null when the user lookup is ambiguous (more than one match)', async () => {
    executor.onMatch(
      'users?username=alice',
      JSON.stringify([
        { id: 7, username: 'alice' },
        { id: 8, username: 'alice' },
      ]),
    );

    const accessLevel = await buildGateway().resolve('org/project', 'alice');

    expect(accessLevel).toBeNull();
  });

  it('returns null when the username is unknown (empty user list)', async () => {
    executor.onMatch('users?username=ghost', JSON.stringify([]));

    const accessLevel = await buildGateway().resolve('org/project', 'ghost');

    expect(accessLevel).toBeNull();
  });

  it('returns null when the membership lookup throws (non-member, fail-closed)', async () => {
    executor.onMatch('users?username=alice', JSON.stringify([{ id: 7, username: 'alice' }]));
    executor.failOnMatch('members/all/7');

    const accessLevel = await buildGateway().resolve('org/project', 'alice');

    expect(accessLevel).toBeNull();
  });

  it('returns null when membership access_level is below the known scale', async () => {
    executor.onMatch('users?username=alice', JSON.stringify([{ id: 7, username: 'alice' }]));
    executor.onMatch('members/all/7', JSON.stringify({ id: 7, access_level: 999 }));

    const accessLevel = await buildGateway().resolve('org/project', 'alice');

    expect(accessLevel).toBeNull();
  });
});
