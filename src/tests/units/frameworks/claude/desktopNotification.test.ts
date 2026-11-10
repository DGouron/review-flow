import { describe, expect, it } from 'vitest';

import {
  buildDesktopNotificationCommand,
  resolveTerminalNotifier,
} from '@/frameworks/claude/desktopNotification.js';

describe('resolveTerminalNotifier', () => {
  it('finds the binary in one of the PATH directories', () => {
    const found = resolveTerminalNotifier(
      '/usr/bin:/opt/homebrew/bin',
      (candidate) => candidate === '/opt/homebrew/bin/terminal-notifier',
    );

    expect(found).toBe(true);
  });

  it('reports absence when no PATH directory holds the binary', () => {
    expect(resolveTerminalNotifier('/usr/bin:/usr/local/bin', () => false)).toBe(false);
  });

  it('reports absence when PATH is unset', () => {
    expect(resolveTerminalNotifier(null, () => true)).toBe(false);
  });

  it('reports absence without probing anything when PATH is empty', () => {
    const probed: string[] = [];
    const found = resolveTerminalNotifier('', (candidate) => {
      probed.push(candidate);
      return true;
    });

    expect(found).toBe(false);
    expect(probed).toEqual([]);
  });

  it('probes every PATH directory in order until the binary is found', () => {
    const probed: string[] = [];
    const found = resolveTerminalNotifier(
      '/usr/bin:/usr/local/bin:/opt/homebrew/bin:/opt/custom/bin',
      (candidate) => {
        probed.push(candidate);
        return candidate === '/opt/homebrew/bin/terminal-notifier';
      },
    );

    expect(found).toBe(true);
    expect(probed).toEqual([
      '/usr/bin/terminal-notifier',
      '/usr/local/bin/terminal-notifier',
      '/opt/homebrew/bin/terminal-notifier',
    ]);
  });

  it('ignores empty PATH segments, which would probe the filesystem root', () => {
    const probed: string[] = [];
    resolveTerminalNotifier('/usr/bin::/opt/bin', (candidate) => {
      probed.push(candidate);
      return false;
    });

    expect(probed).toEqual(['/usr/bin/terminal-notifier', '/opt/bin/terminal-notifier']);
  });
});

describe('buildDesktopNotificationCommand', () => {
  describe('on macOS with terminal-notifier installed', () => {
    it('prefers terminal-notifier, which posts under its own app identity', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: true },
        'Review terminée',
        'MR !42',
      );

      expect(command.command).toBe('terminal-notifier');
      expect(command.args).toEqual(['-title', 'Review terminée', '-message', 'MR !42']);
    });

    it('passes title and message through untouched, since they are separate argv entries', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: true },
        'Review',
        'MR "quoted" title\nsecond line',
      );

      expect(command.args.at(-1)).toBe('MR "quoted" title\nsecond line');
    });

    it('passes a quoted title through untouched as well', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: true },
        'Review "followup"',
        'MR !42',
      );

      expect(command.args).toEqual(['-title', 'Review "followup"', '-message', 'MR !42']);
    });
  });

  describe('on macOS without terminal-notifier', () => {
    it('falls back to osascript, which ships with the OS', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: false },
        'Review terminée',
        'MR !42',
      );

      expect(command.command).toBe('osascript');
      expect(command.args).toEqual([
        '-e',
        'display notification "MR !42" with title "Review terminée"',
      ]);
    });

    it('escapes double quotes so a quoted MR title cannot break the AppleScript', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: false },
        'Review',
        'MR "quoted" title',
      );

      expect(command.args[1]).toBe(
        'display notification "MR \\"quoted\\" title" with title "Review"',
      );
    });

    it('escapes backslashes before quotes so escaping cannot be smuggled', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: false },
        'Review',
        'path\\to\\file',
      );

      expect(command.args[1]).toBe('display notification "path\\\\to\\\\file" with title "Review"');
    });

    it('strips newlines, which would terminate the AppleScript statement', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: false },
        'Review',
        'line one\nline two',
      );

      expect(command.args[1]).toBe('display notification "line one line two" with title "Review"');
    });

    it('escapes double quotes in the title too', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'darwin', hasTerminalNotifier: false },
        'Review "followup"',
        'MR !42',
      );

      expect(command.args[1]).toBe(
        'display notification "MR !42" with title "Review \\"followup\\""',
      );
    });
  });

  describe('on Linux', () => {
    it('keeps notify-send with the existing flags', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'linux', hasTerminalNotifier: false },
        'Review terminée',
        'MR !42',
      );

      expect(command.command).toBe('notify-send');
      expect(command.args).toEqual([
        '--app-name=Claude Review',
        '--urgency=normal',
        '--icon=dialog-information',
        'Review terminée',
        'MR !42',
      ]);
    });

    it('passes title and message through untouched, since they are separate argv entries', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'linux', hasTerminalNotifier: false },
        'Review',
        'MR "quoted" title',
      );

      expect(command.args.at(-1)).toBe('MR "quoted" title');
    });

    it('ignores terminal-notifier even when a binary of that name is on PATH', () => {
      const command = buildDesktopNotificationCommand(
        { platform: 'linux', hasTerminalNotifier: true },
        'Review',
        'MR !42',
      );

      expect(command.command).toBe('notify-send');
    });
  });

  it('keeps notify-send on Windows, as before', () => {
    const command = buildDesktopNotificationCommand(
      { platform: 'win32', hasTerminalNotifier: false },
      'Review',
      'MR !42',
    );

    expect(command.command).toBe('notify-send');
  });

  it('falls back to notify-send on other platforms', () => {
    expect(
      buildDesktopNotificationCommand(
        { platform: 'freebsd', hasTerminalNotifier: false },
        'Review',
        'MR !42',
      ).command,
    ).toBe('notify-send');
  });
});
