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
  });
});
