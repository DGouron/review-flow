import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import type {
  SetupProcessExitHandler,
  SetupProcessGateway,
  SetupProcessHandle,
  SetupProcessLineHandler,
  SetupProcessSpawnOptions,
} from '@/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.js';

export function splitLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (buffer + chunk).split('\n');
  const rest = parts.pop() ?? '';
  const lines = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  return { lines, rest };
}

class ChildProcessSetupHandle implements SetupProcessHandle {
  private lineHandler: SetupProcessLineHandler | null = null;
  private exitHandler: SetupProcessExitHandler | null = null;
  private buffer = '';

  constructor(private readonly child: ChildProcessByStdio<Writable, Readable, Readable>) {
    this.child.stdout.setEncoding('utf-8');
    this.child.stdout.on('data', (chunk: string) => {
      this.consume(chunk);
    });
    this.child.on('close', (code) => {
      this.flush();
      this.exitHandler?.(code);
    });
    this.child.on('error', () => {
      this.exitHandler?.(null);
    });
  }

  get pid(): number | null {
    return this.child.pid ?? null;
  }

  onLine(handler: SetupProcessLineHandler): void {
    this.lineHandler = handler;
  }

  onExit(handler: SetupProcessExitHandler): void {
    this.exitHandler = handler;
  }

  writeLine(line: string): void {
    if (this.child.stdin.writable) {
      this.child.stdin.write(`${line}\n`);
    }
  }

  kill(): void {
    this.child.kill();
  }

  private consume(chunk: string): void {
    const { lines, rest } = splitLines(this.buffer, chunk);
    this.buffer = rest;
    for (const line of lines) {
      this.lineHandler?.(line);
    }
  }

  private flush(): void {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (remaining.length > 0) {
      this.lineHandler?.(remaining);
    }
  }
}

export interface SetupProcessChildProcessGatewayOptions {
  cliPath: string;
}

export class SetupProcessChildProcessGateway implements SetupProcessGateway {
  constructor(private readonly options: SetupProcessChildProcessGatewayOptions) {}

  spawn(options?: SetupProcessSpawnOptions): SetupProcessHandle {
    const args = [this.options.cliPath, 'setup', '--json'];
    const projectPath = options?.projectPath ?? null;
    if (projectPath !== null) {
      args.push(projectPath);
    }

    const child = spawn(process.execPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    return new ChildProcessSetupHandle(child);
  }
}
