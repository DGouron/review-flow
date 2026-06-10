import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// Run integration tests against the TypeScript source via tsx — avoids the
// requirement of a prior `yarn build`, keeping the tests stable in fresh
// checkouts and on CI without a build step.
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(currentDir, '../../../..');
const tsxBin = join(repoRoot, 'node_modules/.bin/tsx');
const cliSrc = join(repoRoot, 'src/main/cli.ts');
const cliCommand = `${tsxBin} ${cliSrc}`;

// Cold-start tsx spawns can exceed the 5s default under load; allow headroom.
const TEST_TIMEOUT_MS = 15000;

describe('CLI integration', () => {
  it(
    'should print version when called with --version',
    () => {
      const output = execSync(`${cliCommand} --version`).toString().trim();
      expect(output).toMatch(/^\d+\.\d+\.\d+$/);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should print help when called with --help',
    () => {
      const output = execSync(`${cliCommand} --help`).toString();
      expect(output).toContain('reviewflow');
      expect(output).toContain('start');
      expect(output).toContain('stop');
      expect(output).toContain('status');
      expect(output).toContain('logs');
      expect(output).toContain('--daemon');
      expect(output).toContain('--follow');
      expect(output).toContain('--json');
      expect(output).toContain('--force');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should exit with code 1 when status is checked and server is not running',
    () => {
      try {
        execSync(`${cliCommand} status`, { env: { ...process.env, NO_COLOR: '1' } });
        expect.unreachable('should have thrown');
      } catch (error) {
        const execError = error as { status: number; stdout: Buffer };
        expect(execError.status).toBe(1);
        expect(execError.stdout.toString()).toContain('not running');
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should output JSON for status --json when stopped',
    () => {
      try {
        execSync(`${cliCommand} status --json`);
        expect.unreachable('should have thrown');
      } catch (error) {
        const execError = error as { status: number; stdout: Buffer };
        expect(execError.status).toBe(1);
        const parsed = JSON.parse(execError.stdout.toString().trim());
        expect(parsed.status).toBe('stopped');
      }
    },
    TEST_TIMEOUT_MS,
  );
});
