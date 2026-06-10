import { describe, it, expect } from 'vitest';

import {
  WorktreeSizeProbeCliGateway,
  type DuProcessRunner,
} from '@/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.js';

describe('WorktreeSizeProbeCliGateway', () => {
  it('returns the parsed byte count from the first du -sb token', async () => {
    const runner: DuProcessRunner = async () => ({
      stdout: '218103808\t/home/.reviewflow/worktrees/example\n',
      stderr: '',
      exitCode: 0,
    });
    const gateway = new WorktreeSizeProbeCliGateway(runner);

    const result = await gateway.probe('/home/.reviewflow/worktrees/example');

    expect(result).toBe(218_103_808);
  });

  it('returns null when du exits with a non-zero code', async () => {
    const runner: DuProcessRunner = async () => ({
      stdout: '',
      stderr: 'du: cannot access',
      exitCode: 1,
    });
    const gateway = new WorktreeSizeProbeCliGateway(runner);

    const result = await gateway.probe('/missing/path');

    expect(result).toBeNull();
  });

  it('returns null when stdout is not parseable', async () => {
    const runner: DuProcessRunner = async () => ({
      stdout: 'garbage output\n',
      stderr: '',
      exitCode: 0,
    });
    const gateway = new WorktreeSizeProbeCliGateway(runner);

    const result = await gateway.probe('/tmp/x');

    expect(result).toBeNull();
  });

  it('returns null when the runner throws', async () => {
    const runner: DuProcessRunner = async () => {
      throw new Error('process spawn failed');
    };
    const gateway = new WorktreeSizeProbeCliGateway(runner);

    const result = await gateway.probe('/tmp/x');

    expect(result).toBeNull();
  });

  it('invokes the runner with du -sb <path>', async () => {
    const calls: { args: string[]; cwd: string | undefined }[] = [];
    const runner: DuProcessRunner = async (command) => {
      calls.push({ args: command.args, cwd: command.cwd });
      return { stdout: '42\t/p\n', stderr: '', exitCode: 0 };
    };
    const gateway = new WorktreeSizeProbeCliGateway(runner);

    await gateway.probe('/tmp/worktrees/a');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(['-sb', '/tmp/worktrees/a']);
  });
});
