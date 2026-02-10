import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const cliPath = join(currentDir, '../../../../dist/main/cli.js');

describe('CLI integration', () => {
  it('should print version when called with --version', () => {
    const output = execSync(`node ${cliPath} --version`).toString().trim();
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should print help when called with --help', () => {
    const output = execSync(`node ${cliPath} --help`).toString();
    expect(output).toContain('reviewflow');
    expect(output).toContain('start');
    expect(output).toContain('stop');
    expect(output).toContain('status');
    expect(output).toContain('logs');
    expect(output).toContain('--daemon');
    expect(output).toContain('--follow');
    expect(output).toContain('--json');
    expect(output).toContain('--force');
  });

  it('should exit with code 1 when status is checked and server is not running', () => {
    try {
      execSync(`node ${cliPath} status`, { env: { ...process.env, NO_COLOR: '1' } });
      expect.unreachable('should have thrown');
    } catch (error) {
      const execError = error as { status: number; stdout: Buffer };
      expect(execError.status).toBe(1);
      expect(execError.stdout.toString()).toContain('not running');
    }
  });

  it('should output JSON for status --json when stopped', () => {
    try {
      execSync(`node ${cliPath} status --json`);
      expect.unreachable('should have thrown');
    } catch (error) {
      const execError = error as { status: number; stdout: Buffer };
      expect(execError.status).toBe(1);
      const parsed = JSON.parse(execError.stdout.toString().trim());
      expect(parsed.status).toBe('stopped');
    }
  });
});
