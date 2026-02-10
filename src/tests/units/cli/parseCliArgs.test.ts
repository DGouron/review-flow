import { describe, it, expect } from 'vitest';
import { parseCliArgs, type CliArgs } from '../../../cli/parseCliArgs.js';

describe('parseCliArgs', () => {
  describe('start command', () => {
    it('should return start command by default', () => {
      const result = parseCliArgs([]);

      expect(result.command).toBe('start');
    });

    it('should return start for explicit start argument', () => {
      const result = parseCliArgs(['start']);

      expect(result.command).toBe('start');
    });

    it('should default to start for unknown positional args', () => {
      const result = parseCliArgs(['banana']);

      expect(result.command).toBe('start');
    });

    it('should detect --skip-dependency-check flag', () => {
      const result = parseCliArgs(['start', '--skip-dependency-check']);

      expect(result.command).toBe('start');
      expect((result as CliArgs & { command: 'start' }).skipDependencyCheck).toBe(true);
    });

    it('should detect --daemon flag', () => {
      const result = parseCliArgs(['start', '--daemon']);

      expect(result.command).toBe('start');
      expect((result as CliArgs & { command: 'start' }).daemon).toBe(true);
    });

    it('should detect -d short flag for daemon', () => {
      const result = parseCliArgs(['start', '-d']);

      expect(result.command).toBe('start');
      expect((result as CliArgs & { command: 'start' }).daemon).toBe(true);
    });

    it('should detect --port flag with value', () => {
      const result = parseCliArgs(['start', '--port', '4000']);

      expect(result.command).toBe('start');
      expect((result as CliArgs & { command: 'start' }).port).toBe(4000);
    });

    it('should detect -p short flag for port', () => {
      const result = parseCliArgs(['start', '-p', '5000']);

      expect(result.command).toBe('start');
      expect((result as CliArgs & { command: 'start' }).port).toBe(5000);
    });

    it('should leave port undefined when not specified', () => {
      const result = parseCliArgs(['start']);

      expect(result.command).toBe('start');
      expect((result as CliArgs & { command: 'start' }).port).toBeUndefined();
    });
  });

  describe('stop command', () => {
    it('should detect stop command', () => {
      const result = parseCliArgs(['stop']);

      expect(result.command).toBe('stop');
    });

    it('should detect --force flag', () => {
      const result = parseCliArgs(['stop', '--force']);

      expect(result.command).toBe('stop');
      expect((result as CliArgs & { command: 'stop' }).force).toBe(true);
    });

    it('should detect -f short flag for force', () => {
      const result = parseCliArgs(['stop', '-f']);

      expect(result.command).toBe('stop');
      expect((result as CliArgs & { command: 'stop' }).force).toBe(true);
    });
  });

  describe('status command', () => {
    it('should detect status command', () => {
      const result = parseCliArgs(['status']);

      expect(result.command).toBe('status');
    });

    it('should detect --json flag', () => {
      const result = parseCliArgs(['status', '--json']);

      expect(result.command).toBe('status');
      expect((result as CliArgs & { command: 'status' }).json).toBe(true);
    });
  });

  describe('logs command', () => {
    it('should detect logs command', () => {
      const result = parseCliArgs(['logs']);

      expect(result.command).toBe('logs');
    });

    it('should detect --follow flag', () => {
      const result = parseCliArgs(['logs', '--follow']);

      expect(result.command).toBe('logs');
      expect((result as CliArgs & { command: 'logs' }).follow).toBe(true);
    });

    it('should detect -f short flag for follow', () => {
      const result = parseCliArgs(['logs', '-f']);

      expect(result.command).toBe('logs');
      expect((result as CliArgs & { command: 'logs' }).follow).toBe(true);
    });

    it('should detect --lines flag with value', () => {
      const result = parseCliArgs(['logs', '--lines', '50']);

      expect(result.command).toBe('logs');
      expect((result as CliArgs & { command: 'logs' }).lines).toBe(50);
    });

    it('should detect -n short flag for lines', () => {
      const result = parseCliArgs(['logs', '-n', '25']);

      expect(result.command).toBe('logs');
      expect((result as CliArgs & { command: 'logs' }).lines).toBe(25);
    });

    it('should default lines to 20 when not specified', () => {
      const result = parseCliArgs(['logs']);

      expect(result.command).toBe('logs');
      expect((result as CliArgs & { command: 'logs' }).lines).toBe(20);
    });
  });

  describe('version and help flags', () => {
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

    it('should prioritize --version over commands', () => {
      const result = parseCliArgs(['start', '--version']);

      expect(result.command).toBe('version');
    });

    it('should prioritize --help over commands', () => {
      const result = parseCliArgs(['start', '--help']);

      expect(result.command).toBe('help');
    });
  });
});
