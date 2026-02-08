import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../../../cli/parseCliArgs.js';

describe('parseCliArgs', () => {
  it('should return start command by default', () => {
    const result = parseCliArgs([]);

    expect(result.command).toBe('start');
  });

  it('should detect --version flag', () => {
    const result = parseCliArgs(['--version']);

    expect(result.command).toBe('version');
  });

  it('should detect -v flag', () => {
    const result = parseCliArgs(['-v']);

    expect(result.command).toBe('version');
  });

  it('should detect --help flag', () => {
    const result = parseCliArgs(['--help']);

    expect(result.command).toBe('help');
  });

  it('should detect -h flag', () => {
    const result = parseCliArgs(['-h']);

    expect(result.command).toBe('help');
  });

  it('should detect explicit start command', () => {
    const result = parseCliArgs(['start']);

    expect(result.command).toBe('start');
  });

  it('should detect --skip-dependency-check flag', () => {
    const result = parseCliArgs(['start', '--skip-dependency-check']);

    expect(result.skipDependencyCheck).toBe(true);
  });
});
