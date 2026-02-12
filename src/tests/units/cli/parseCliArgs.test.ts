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

    it('should detect --open flag', () => {
      const result = parseCliArgs(['start', '--open']);

      expect(result).toEqual(expect.objectContaining({ command: 'start', open: true }));
    });

    it('should detect -o short flag for open', () => {
      const result = parseCliArgs(['start', '-o']);

      expect(result).toEqual(expect.objectContaining({ command: 'start', open: true }));
    });

    it('should default open to false when not specified', () => {
      const result = parseCliArgs(['start']);

      expect(result).toEqual(expect.objectContaining({ command: 'start', open: false }));
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

  describe('init command', () => {
    it('should detect init command', () => {
      const result = parseCliArgs(['init']);

      expect(result.command).toBe('init');
    });

    it('should detect --yes flag', () => {
      const result = parseCliArgs(['init', '--yes']);

      expect(result.command).toBe('init');
      expect((result as CliArgs & { command: 'init' }).yes).toBe(true);
    });

    it('should detect -y short flag for yes', () => {
      const result = parseCliArgs(['init', '-y']);

      expect(result.command).toBe('init');
      expect((result as CliArgs & { command: 'init' }).yes).toBe(true);
    });

    it('should detect --skip-mcp flag', () => {
      const result = parseCliArgs(['init', '--skip-mcp']);

      expect(result.command).toBe('init');
      expect((result as CliArgs & { command: 'init' }).skipMcp).toBe(true);
    });

    it('should detect --show-secrets flag', () => {
      const result = parseCliArgs(['init', '--show-secrets']);

      expect(result.command).toBe('init');
      expect((result as CliArgs & { command: 'init' }).showSecrets).toBe(true);
    });

    it('should detect --scan-path with value', () => {
      const result = parseCliArgs(['init', '--scan-path', '/custom/path']);

      expect(result.command).toBe('init');
      expect((result as CliArgs & { command: 'init' }).scanPaths).toEqual(['/custom/path']);
    });

    it('should collect multiple --scan-path values', () => {
      const result = parseCliArgs([
        'init', '--scan-path', '/path/a', '--scan-path', '/path/b',
      ]);

      expect(result.command).toBe('init');
      expect((result as CliArgs & { command: 'init' }).scanPaths).toEqual(['/path/a', '/path/b']);
    });

    it('should default flags to false', () => {
      const result = parseCliArgs(['init']);

      expect(result.command).toBe('init');
      const initArgs = result as CliArgs & { command: 'init' };
      expect(initArgs.yes).toBe(false);
      expect(initArgs.skipMcp).toBe(false);
      expect(initArgs.showSecrets).toBe(false);
      expect(initArgs.scanPaths).toEqual([]);
    });
  });

  describe('validate command', () => {
    it('should detect validate command', () => {
      const result = parseCliArgs(['validate']);

      expect(result.command).toBe('validate');
    });

    it('should detect --fix flag', () => {
      const result = parseCliArgs(['validate', '--fix']);

      expect(result.command).toBe('validate');
      expect((result as CliArgs & { command: 'validate' }).fix).toBe(true);
    });

    it('should default fix to false', () => {
      const result = parseCliArgs(['validate']);

      expect(result.command).toBe('validate');
      expect((result as CliArgs & { command: 'validate' }).fix).toBe(false);
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
