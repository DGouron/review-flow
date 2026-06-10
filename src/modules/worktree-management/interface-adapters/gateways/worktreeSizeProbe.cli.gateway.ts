import { spawn } from 'node:child_process';

import type { WorktreeSizeProbeGateway } from '@/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.js';

export interface DuCommand {
  args: string[];
  cwd?: string;
}

export interface DuCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type DuProcessRunner = (command: DuCommand) => Promise<DuCommandResult>;

function defaultDuRunner(): DuProcessRunner {
  return async (command) =>
    new Promise<DuCommandResult>((resolve, reject) => {
      const child = spawn('du', command.args, { cwd: command.cwd });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
}

function parseBytes(stdout: string): number | null {
  const firstLine = stdout.split('\n')[0]?.trim() ?? '';
  const firstToken = firstLine.split(/\s+/)[0] ?? '';
  if (firstToken.length === 0) return null;
  const value = Number.parseInt(firstToken, 10);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export class WorktreeSizeProbeCliGateway implements WorktreeSizeProbeGateway {
  private readonly runner: DuProcessRunner;

  constructor(runner: DuProcessRunner = defaultDuRunner()) {
    this.runner = runner;
  }

  async probe(path: string): Promise<number | null> {
    try {
      const result = await this.runner({ args: ['-sb', path] });
      if (result.exitCode !== 0) return null;
      return parseBytes(result.stdout);
    } catch {
      return null;
    }
  }
}
