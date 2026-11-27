import { describe, expect, it } from 'vitest';

import type { RoleSessionLaunch } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import type {
  ClaudeProcessRunArgs,
  ClaudeProcessRunner,
  ClaudeProcessRunResult,
} from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { RoleSessionClaudeCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSession.claude.cli.gateway.js';

function scriptedRunner(result: ClaudeProcessRunResult): {
  runner: ClaudeProcessRunner;
  calls: ClaudeProcessRunArgs[];
} {
  const calls: ClaudeProcessRunArgs[] = [];
  const runner: ClaudeProcessRunner = async (request) => {
    calls.push(request);
    return result;
  };
  return { runner, calls };
}

const missingClaudeRunner: ClaudeProcessRunner = async () => {
  throw new Error('spawn claude ENOENT');
};

const launch: RoleSessionLaunch = {
  name: 'Revue #2111 · lot bugs',
  model: 'opus',
  brief: 'Audite les bugs.',
  cwd: '/wt/github-acme-app-2111',
};

describe('RoleSessionClaudeCliGateway.launch', () => {
  it('starts a named background session in the worktree with the brief on stdin', async () => {
    const { runner, calls } = scriptedRunner({
      stdout: 'backgrounded · df887045 · Revue #2111 · lot bugs\n  claude agents  list sessions',
      stderr: '',
      exitCode: 0,
    });

    const result = await new RoleSessionClaudeCliGateway(runner).launch(launch);

    expect(result).toEqual({ status: 'dispatched', sessionId: 'df887045' });
    expect(calls[0]?.cwd).toBe('/wt/github-acme-app-2111');
    expect(calls[0]?.stdin).toBe('Audite les bugs.');
    const args = calls[0]?.args ?? [];
    expect(args.slice(0, 5)).toEqual([
      '--bg',
      '--name',
      'Revue #2111 · lot bugs',
      '--model',
      'opus',
    ]);
    expect(args.at(-1)).toBe('--');
  });

  it('keeps the session read-only and without any MCP server', async () => {
    const { runner, calls } = scriptedRunner({
      stdout: 'backgrounded · ab12',
      stderr: '',
      exitCode: 0,
    });

    await new RoleSessionClaudeCliGateway(runner).launch(launch);

    const args = calls[0]?.args ?? [];
    const valueOf = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
    expect(valueOf('--permission-mode')).toBe('dontAsk');
    expect(valueOf('--tools')).toBe('Read,Glob,Grep,Bash');
    expect(valueOf('--allowedTools')?.split(',')).toEqual([
      'Read',
      'Glob',
      'Grep',
      'Bash(git diff:*)',
      'Bash(git log:*)',
      'Bash(git show:*)',
      'Bash(git blame:*)',
      'Bash(git status:*)',
      'Bash(ls:*)',
    ]);
    expect(valueOf('--mcp-config')).toBe('{"mcpServers":{}}');
    expect(args).toContain('--strict-mcp-config');
  });

  it('reports a failed dispatch with its stderr', async () => {
    const { runner } = scriptedRunner({ stdout: '', stderr: 'unknown model', exitCode: 1 });

    const result = await new RoleSessionClaudeCliGateway(runner).launch(launch);

    expect(result).toEqual({ status: 'failed', rawStderr: 'unknown model' });
  });

  it('reports a runner that throws as a failed dispatch', async () => {
    const result = await new RoleSessionClaudeCliGateway(missingClaudeRunner).launch(launch);

    expect(result).toEqual({ status: 'failed', rawStderr: 'spawn claude ENOENT' });
  });
});

describe('RoleSessionClaudeCliGateway.listBackgroundSessions', () => {
  it('lists every background session, finished ones included', async () => {
    const { runner, calls } = scriptedRunner({
      stdout: JSON.stringify([
        {
          id: 'df887045',
          cwd: '/wt/github-acme-app-2111',
          kind: 'background',
          startedAt: 1795768337383,
          name: 'Revue #2111 · lot bugs',
          state: 'done',
        },
        { id: 'abc12345' },
      ]),
      stderr: '',
      exitCode: 0,
    });

    const listing = await new RoleSessionClaudeCliGateway(runner).listBackgroundSessions();

    expect(calls[0]?.args).toEqual(['agents', '--json', '--all']);
    expect(listing).toEqual({
      status: 'listed',
      sessions: [
        {
          sessionId: 'df887045',
          name: 'Revue #2111 · lot bugs',
          cwd: '/wt/github-acme-app-2111',
          startedAt: new Date(1795768337383),
        },
        { sessionId: 'abc12345', name: null, cwd: null, startedAt: null },
      ],
    });
  });

  it('fails when claude agents exits with an error', async () => {
    const { runner } = scriptedRunner({ stdout: '', stderr: 'daemon down', exitCode: 1 });

    const listing = await new RoleSessionClaudeCliGateway(runner).listBackgroundSessions();

    expect(listing).toEqual({ status: 'failed', reason: 'daemon down' });
  });

  it('fails when the listing is not a JSON array', async () => {
    const { runner } = scriptedRunner({ stdout: 'not json', stderr: '', exitCode: 0 });

    const listing = await new RoleSessionClaudeCliGateway(runner).listBackgroundSessions();

    expect(listing.status).toBe('failed');
  });
});
