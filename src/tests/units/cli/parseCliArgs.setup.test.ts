import { describe, it, expect } from 'vitest';

import { parseCliArgs, type CliArgs } from '@/cli/parseCliArgs.js';

type SetupArgs = CliArgs & { command: 'setup' };

describe('parseCliArgs — setup command', () => {
  it('recognizes setup as a top-level command', () => {
    const result = parseCliArgs(['setup']);
    expect(result.command).toBe('setup');
  });

  it('captures a positional path argument', () => {
    const result = parseCliArgs(['setup', '/home/user/project']) as SetupArgs;
    expect(result.path).toBe('/home/user/project');
  });

  it('captures --path flag value', () => {
    const result = parseCliArgs(['setup', '--path', '/x/y']) as SetupArgs;
    expect(result.path).toBe('/x/y');
  });

  it('parses every wizard flag', () => {
    const result = parseCliArgs([
      'setup',
      '--json',
      '--force',
      '--ai',
      '--yes',
      '--show-secrets',
    ]) as SetupArgs;
    expect(result.json).toBe(true);
    expect(result.force).toBe(true);
    expect(result.ai).toBe(true);
    expect(result.yes).toBe(true);
    expect(result.showSecrets).toBe(true);
  });

  it('-y is a short alias for --yes', () => {
    const result = parseCliArgs(['setup', '-y']) as SetupArgs;
    expect(result.yes).toBe(true);
  });

  it('defaults every flag to false and path to undefined when only the verb is given', () => {
    const result = parseCliArgs(['setup']) as SetupArgs;
    expect(result.path).toBeUndefined();
    expect(result.json).toBe(false);
    expect(result.force).toBe(false);
    expect(result.ai).toBe(false);
    expect(result.yes).toBe(false);
    expect(result.showSecrets).toBe(false);
  });
});
