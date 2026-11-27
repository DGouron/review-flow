import { beforeEach, describe, expect, it } from 'vitest';

import {
  executeSessionAwait,
  type SessionAwaitDependencies,
} from '@/main/commands/sessionAwait.command.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import { AwaitRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/awaitRoleSessions.usecase.js';
import { RoleSessionJobFactory } from '@/tests/factories/roleSessionJob.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const jobId = 'github:acme/app:2111';

function listed(sessionId: string, state: string): BackgroundSession {
  return { sessionId: parseSessionId(sessionId), name: null, cwd: null, startedAt: null, state };
}

describe('executeSessionAwait', () => {
  const launchedAt = '2026-11-27T09:00:00.000Z';
  let printed: string[];
  let exitCodes: number[];
  let waitedMs: number[];
  let clock: Date;
  let roleSessionGateway: StubRoleSessionGateway;
  let dependencies: SessionAwaitDependencies;

  beforeEach(() => {
    printed = [];
    exitCodes = [];
    waitedMs = [];
    roleSessionGateway = new StubRoleSessionGateway();
    const roleSessionJobGateway = new InMemoryRoleSessionJobGateway();
    roleSessionJobGateway.save(
      RoleSessionJobFactory.create({
        jobId,
        roleSessions: [
          { sessionId: parseSessionId('aaaa0001'), role: 'lot:bugs', launchedAt },
          { sessionId: parseSessionId('aaaa0002'), role: 'lot:tests', launchedAt },
          { sessionId: parseSessionId('aaaa0003'), role: 'lot:architecture', launchedAt },
        ],
      }),
    );
    clock = new Date('2026-11-27T09:20:00.000Z');
    dependencies = {
      awaitRoleSessions: new AwaitRoleSessionsUseCase({
        roleSessionGateway,
        roleSessionJobGateway,
        sessionGateway: new StubClaudeSessionGateway(),
        reviewSettingsOf: () => null,
        now: () => clock,
        wait: async (milliseconds) => {
          waitedMs.push(milliseconds);
          clock = new Date(clock.getTime() + milliseconds);
        },
        pollIntervalMs: 10_000,
      }),
      print: (line) => printed.push(line),
      exit: (code) => exitCodes.push(code),
    };
  });

  it('prints one line per finished role session and exits 0', async () => {
    roleSessionGateway.listBackground([
      listed('aaaa0001', 'done'),
      listed('aaaa0002', 'failed'),
      listed('aaaa0003', 'working'),
    ]);

    await executeSessionAwait({ job: jobId, maxWait: null }, dependencies);

    expect(printed).toEqual([
      'DONE lot:bugs aaaa0001',
      'FAILED lot:tests aaaa0002',
      'TIMEOUT lot:architecture aaaa0003',
    ]);
    expect(exitCodes).toEqual([0]);
  });

  it('reads the maximum wait in seconds and stays silent on a lot still working', async () => {
    clock = new Date('2026-11-27T09:05:00.000Z');
    roleSessionGateway.listBackground([
      listed('aaaa0001', 'done'),
      listed('aaaa0002', 'done'),
      listed('aaaa0003', 'working'),
    ]);

    await executeSessionAwait({ job: jobId, maxWait: '25' }, dependencies);

    expect(waitedMs).toEqual([10_000, 10_000, 5_000]);
    expect(printed).toEqual(['DONE lot:bugs aaaa0001', 'DONE lot:tests aaaa0002']);
    expect(exitCodes).toEqual([0]);
  });

  it('refuses without --job', async () => {
    await executeSessionAwait({ job: null, maxWait: '540' }, dependencies);

    expect(printed).toEqual([
      'ERROR missing --job (usage: reviewflow session await --job <jobId> [--max-wait <seconds>])',
    ]);
    expect(exitCodes).toEqual([1]);
  });

  it.each(['ten', '-5', '1.5'])('refuses a maximum wait of %j', async (maxWait) => {
    await executeSessionAwait({ job: jobId, maxWait }, dependencies);

    expect(printed).toEqual([
      `ERROR --max-wait must be a whole number of seconds, got "${maxWait}"`,
    ]);
    expect(exitCodes).toEqual([1]);
  });

  it('prints the refusal of an unknown job and exits 1', async () => {
    await executeSessionAwait({ job: 'github:acme/app:404', maxWait: null }, dependencies);

    expect(printed).toEqual(['ERROR unknown job github:acme/app:404']);
    expect(exitCodes).toEqual([1]);
  });
});
